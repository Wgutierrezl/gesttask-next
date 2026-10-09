import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@/infrastructure/db/client";
import { pgErrorCode } from "@/infrastructure/db/pg-error";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";
import { connectTestDb, resetDb, testDatabaseUrl } from "./support/db";
import { deferred } from "./support/tx";

const handle = connectTestDb();
afterAll(() => handle.close());

describe("resetDb safety", () => {
  it("refuses to truncate a database whose name does not end in _test", async () => {
    const url = new URL(testDatabaseUrl());
    url.pathname = url.pathname.replace(/_test$/, "");
    const dev = createDb({ driver: "pg", url: url.toString() });
    try {
      await expect(resetDb(dev)).rejects.toThrow(/_test/);
    } finally {
      await dev.close();
    }
  });
});

describe("session limits", () => {
  it("applies the configured statement and lock timeouts to every connection", async () => {
    const own = createDb({ driver: "pg", url: testDatabaseUrl(), statementTimeoutMs: 4000, lockTimeoutMs: 750, maxConnections: 1 });
    try {
      const { rows } = await own.db.execute<{ statement_timeout: string; lock_timeout: string }>(
        sql`SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout`,
      );
      expect(rows[0]).toEqual({ statement_timeout: "4s", lock_timeout: "750ms" });
    } finally {
      await own.close();
    }
  });

  it("fails a lock wait with lock_not_available instead of waiting forever", async () => {
    await resetDb(handle);
    await handle.db.execute(sql`INSERT INTO boards (id, name, created_at) VALUES (${randomUUID()}, 'b', now())`);
    const impatient = createDb({ driver: "pg", url: testDatabaseUrl(), lockTimeoutMs: 300, maxConnections: 2 });
    const held = deferred();
    const locked = deferred();
    const holder = handle.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT * FROM boards FOR UPDATE`);
      locked.resolve();
      await held.promise;
    });
    await locked.promise;
    try {
      const waiter = impatient.db.transaction((tx) => tx.execute(sql`SELECT * FROM boards FOR UPDATE`));
      const error = await waiter.then(() => undefined, (e: unknown) => e);
      expect(pgErrorCode(error)).toBe("55P03");
    } finally {
      held.resolve();
      await holder;
      await impatient.close();
    }
  });
});

describe("DrizzleUnitOfWork deadlock retry", () => {
  it("retries the deadlock victim so both opposite-order transactions finish", async () => {
    await resetDb(handle);
    const uow = new DrizzleUnitOfWork(handle.db, { sleep: async () => {} });
    const [a, b] = [randomUUID(), randomUUID()];
    for (const id of [a, b]) await handle.db.execute(sql`INSERT INTO boards (id, name, created_at) VALUES (${id}, 'b', now())`);
    const firstLocks = { one: deferred(), two: deferred() };
    const attempts = { one: 0, two: 0 };

    const run = (name: "one" | "two", first: string, second: string, mine: typeof firstLocks.one, theirs: typeof firstLocks.one) =>
      uow.run(async (repos) => {
        const attempt = ++attempts[name];
        await repos.boards.findById(first);
        if (attempt === 1) {
          mine.resolve();
          await theirs.promise; // both hold their first lock before asking for the second: guaranteed cycle
        }
        await repos.boards.findById(second);
        return name;
      });

    const results = await Promise.all([
      run("one", a, b, firstLocks.one, firstLocks.two),
      run("two", b, a, firstLocks.two, firstLocks.one),
    ]);
    expect(results.sort()).toEqual(["one", "two"]);
    expect(attempts.one + attempts.two).toBe(3); // exactly one victim was run again
  });
});
