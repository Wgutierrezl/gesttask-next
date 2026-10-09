import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleDeletionOutbox } from "@/infrastructure/repos/drizzle-deletion-outbox";
import { connectTestDb, resetDb } from "./support/db";

const handle = connectTestDb();
const outbox = new DrizzleDeletionOutbox(handle.db);

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const expire = () => handle.db.execute(sql`UPDATE storage_deletions SET next_attempt_at = now() - interval '1 second'`);

describe("DrizzleDeletionOutbox", () => {
  it("claims queued keys oldest first, up to the limit", async () => {
    await outbox.enqueue(["a", "b", "c"]);
    const claimed = await outbox.claim(2);
    expect(claimed.map((c) => c.storageKey)).toEqual(["a", "b"]);
    expect(claimed.every((c) => c.attempts === 1)).toBe(true);
  });

  it("enqueueing nothing is a no-op", async () => {
    await outbox.enqueue([]);
    expect(await outbox.claim(10)).toEqual([]);
  });

  it("does not hand the same row to a second processor while it is leased", async () => {
    await outbox.enqueue(["a"]);
    expect(await outbox.claim(10)).toHaveLength(1);
    expect(await outbox.claim(10)).toEqual([]);
  });

  it("concurrent claims never share a row", async () => {
    await outbox.enqueue(Array.from({ length: 12 }, (_, i) => `k${i}`));
    const batches = await Promise.all(Array.from({ length: 4 }, () => outbox.claim(5)));
    const keys = batches.flat().map((c) => c.storageKey);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
  });

  it("complete removes the row for good", async () => {
    await outbox.enqueue(["a"]);
    const [claimed] = await outbox.claim(1);
    expect(await outbox.complete(claimed!)).toBe(true);
    await expire();
    expect(await outbox.claim(10)).toEqual([]);
  });

  it("a failed or abandoned row is retried after its lease ends, counting attempts", async () => {
    await outbox.enqueue(["a"]);
    const [first] = await outbox.claim(1);
    expect(await outbox.fail(first!)).toBe(true);
    expect(await outbox.claim(10)).toEqual([]);
    await expire();
    const [second] = await outbox.claim(10);
    expect(second).toMatchObject({ id: first!.id, storageKey: "a", attempts: 2 });
  });

  describe("lease ownership", () => {
    const nextAttemptAt = async () =>
      (await handle.db.execute<{ t: string }>(sql`SELECT next_attempt_at::text AS t FROM storage_deletions`)).rows[0]!.t;

    it("a worker whose lease expired cannot complete a row another worker re-claimed", async () => {
      await outbox.enqueue(["a"]);
      const [stale] = await outbox.claim(1);
      await expire();
      const [fresh] = await outbox.claim(1);
      expect(fresh!.attempts).toBe(2);
      expect(await outbox.complete(stale!)).toBe(false);
      expect((await handle.db.execute(sql`SELECT 1 FROM storage_deletions`)).rows).toHaveLength(1);
      expect(await outbox.complete(fresh!)).toBe(true);
      expect((await handle.db.execute(sql`SELECT 1 FROM storage_deletions`)).rows).toHaveLength(0);
    });

    it("a worker whose lease expired cannot reschedule a row another worker re-claimed", async () => {
      await outbox.enqueue(["a"]);
      const [stale] = await outbox.claim(1);
      await expire();
      const [fresh] = await outbox.claim(1);
      const leased = await nextAttemptAt();
      expect(await outbox.fail(stale!)).toBe(false);
      expect(await nextAttemptAt()).toBe(leased);
      expect(await outbox.fail(fresh!)).toBe(true);
    });
  });

  describe("dead letter", () => {
    const limited = new DrizzleDeletionOutbox(handle.db, { maxAttempts: 3 });
    const dead = async () => (await handle.db.execute<{ k: string }>(sql`SELECT storage_key AS k FROM storage_deletions WHERE dead_at IS NOT NULL`)).rows.map((r) => r.k);

    it("parks a row after its last allowed attempt fails, keeping it for inspection", async () => {
      await limited.enqueue(["a"]);
      for (let attempt = 1; attempt <= 3; attempt++) {
        const [claimed] = await limited.claim(1);
        expect(claimed!.attempts).toBe(attempt);
        await limited.fail(claimed!);
        await expire();
      }
      expect(await dead()).toEqual(["a"]);
      expect(await limited.claim(10)).toEqual([]);
    });

    it("parks a row whose workers keep crashing (leases expire without a verdict)", async () => {
      await limited.enqueue(["a"]);
      for (let attempt = 1; attempt <= 3; attempt++) {
        expect(await limited.claim(1)).toHaveLength(1);
        await expire();
      }
      expect(await limited.claim(10)).toEqual([]);
      expect(await dead()).toEqual(["a"]);
    });

    it("keeps healthy rows flowing next to a parked one", async () => {
      await limited.enqueue(["bad"]);
      for (let attempt = 1; attempt <= 3; attempt++) {
        const [claimed] = await limited.claim(1);
        await limited.fail(claimed!);
        await expire();
      }
      await limited.enqueue(["good"]);
      expect((await limited.claim(10)).map((c) => c.storageKey)).toEqual(["good"]);
    });

    it("rejects a non-positive max attempts", () => {
      expect(() => new DrizzleDeletionOutbox(handle.db, { maxAttempts: 0 })).toThrow(RangeError);
    });
  });
});
