import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/infrastructure/db/client";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";

const pgError = (code: string) => Object.assign(new Error("db"), { code });

/** A database whose `transaction` runs the callback with a dummy tx and records the options it got. */
function fakeDb(outcomes: Array<unknown>) {
  const calls: unknown[] = [];
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, config: unknown) => {
    calls.push(config);
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    return fn({});
  });
  return { db: { transaction } as unknown as Database, calls, transaction };
}

const noSleep = { sleep: async () => {}, random: () => 0.5 };

describe("DrizzleUnitOfWork", () => {
  it("asks for READ COMMITTED explicitly", async () => {
    const { db, calls } = fakeDb([undefined]);
    await new DrizzleUnitOfWork(db, noSleep).run(async () => "ok");
    expect(calls).toEqual([{ isolationLevel: "read committed" }]);
  });

  it.each(["40P01", "40001"])("retries a %s failure and returns the later success", async (code) => {
    const { db, transaction } = fakeDb([pgError(code), pgError(code), undefined]);
    const sleeps: number[] = [];
    const uow = new DrizzleUnitOfWork(db, { ...noSleep, sleep: async (ms) => void sleeps.push(ms) });
    await expect(uow.run(async () => "done")).resolves.toBe("done");
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]!).toBeGreaterThan(sleeps[0]!); // exponential backoff
  });

  it("looks through the Drizzle error wrapper to find the SQLSTATE", async () => {
    const wrapped = new Error("Failed query", { cause: pgError("40P01") });
    const { db, transaction } = fakeDb([wrapped, undefined]);
    await new DrizzleUnitOfWork(db, noSleep).run(async () => 1);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts and rethrows the last error", async () => {
    const last = pgError("40P01");
    const { db, transaction } = fakeDb([pgError("40P01"), pgError("40P01"), last]);
    await expect(new DrizzleUnitOfWork(db, noSleep).run(async () => 1)).rejects.toBe(last);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it.each([pgError("23505"), new Error("boom")])("does not retry other errors (%s)", async (error) => {
    const { db, transaction } = fakeDb([error]);
    await expect(new DrizzleUnitOfWork(db, noSleep).run(async () => 1)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
