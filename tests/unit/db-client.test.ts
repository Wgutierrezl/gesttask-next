import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  configurePool, createDb, DEFAULT_LOCK_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS,
} from "@/infrastructure/db/client";
import { pgConstraint, pgErrorCode } from "@/infrastructure/db/pg-error";

const URL = "postgres://u:p@localhost:5433/db";

describe("createDb", () => {
  it.each(["pg", "neon"] as const)("builds a lazy %s pool and closes it without connecting", async (driver) => {
    const handle = createDb({ driver, url: URL });
    expect(typeof handle.db.transaction).toBe("function");
    await handle.close();
  });
});

describe("pg error helpers", () => {
  it("reads the SQLSTATE and constraint from a driver error", () => {
    const error = Object.assign(new Error("duplicate"), { code: "23505", constraint: "uq" });
    expect(pgErrorCode(error)).toBe("23505");
    expect(pgConstraint(error)).toBe("uq");
  });

  it("looks through the DrizzleQueryError wrapper (cause chain)", () => {
    const wrapped = new Error("Failed query", { cause: Object.assign(new Error("x"), { code: "40P01" }) });
    expect(pgErrorCode(wrapped)).toBe("40P01");
    expect(pgConstraint(wrapped)).toBeUndefined();
  });

  it("returns undefined for anything that is not a database error", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode("text")).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});

describe("configurePool", () => {
  const fakePool = () => {
    const pool = new EventEmitter();
    const queries: string[] = [];
    return { pool, queries, client: { query: async (text: string) => void queries.push(text) } };
  };

  it("sets statement and lock timeouts on every new connection", () => {
    const { pool, client, queries } = fakePool();
    configurePool(pool, { statementTimeoutMs: 1500, lockTimeoutMs: 250 }, () => {});
    pool.emit("connect", client);
    expect(queries).toEqual(["SET statement_timeout = 1500; SET lock_timeout = 250"]);
  });

  it("falls back to safe defaults and rejects nonsense values", () => {
    const { pool, client, queries } = fakePool();
    configurePool(pool, {}, () => {});
    pool.emit("connect", client);
    expect(queries[0]).toBe(`SET statement_timeout = ${DEFAULT_STATEMENT_TIMEOUT_MS}; SET lock_timeout = ${DEFAULT_LOCK_TIMEOUT_MS}`);
    expect(() => configurePool(fakePool().pool, { statementTimeoutMs: -1 }, () => {})).toThrow(RangeError);
    expect(() => configurePool(fakePool().pool, { lockTimeoutMs: 1.5 }, () => {})).toThrow(RangeError);
  });

  it("skips the SET when the driver sends the limits as startup parameters", () => {
    const { pool, client, queries } = fakePool();
    configurePool(pool, {}, () => {}, false);
    pool.emit("connect", client);
    expect(queries).toEqual([]);
  });

  it("logs idle client errors without leaking credentials, and does not crash the process", () => {
    const { pool } = fakePool();
    const log = vi.fn();
    configurePool(pool, {}, log);
    pool.emit("error", Object.assign(new Error("connect failed postgres://user:s3cret@host:5432/db"), { code: "ECONNRESET" }));
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("ECONNRESET");
    expect(logged).not.toContain("s3cret");
  });

  it("reports a failing SET instead of swallowing it", async () => {
    const { pool } = fakePool();
    const log = vi.fn();
    configurePool(pool, {}, log);
    pool.emit("connect", { query: async () => { throw new Error("nope"); } });
    await new Promise((r) => setImmediate(r));
    expect(log).toHaveBeenCalled();
  });
});
