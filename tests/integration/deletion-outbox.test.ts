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
    await outbox.complete(claimed!.id);
    await expire();
    expect(await outbox.claim(10)).toEqual([]);
  });

  it("a failed or abandoned row is retried after its lease ends, counting attempts", async () => {
    await outbox.enqueue(["a"]);
    const [first] = await outbox.claim(1);
    await outbox.fail(first!.id);
    expect(await outbox.claim(10)).toEqual([]);
    await expire();
    const [second] = await outbox.claim(10);
    expect(second).toMatchObject({ id: first!.id, storageKey: "a", attempts: 2 });
  });
});
