import { beforeEach, describe, expect, it } from "vitest";
import { FakeStorage } from "@tests/support/fake-storage";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { drainStorageDeletions } from "./drain-storage-deletions";

describe("drainStorageDeletions (REQ-CAS-02, REQ-ATT-05)", () => {
  let ctx: TestContext;
  let storage: FakeStorage;
  const queue = (keys: string[]) => ctx.uow.run((tx) => tx.outbox.enqueue(keys));
  const drain = (options = {}) => drainStorageDeletions({ outbox: ctx.repos.outbox, storage }, options);
  const rows = () => [...ctx.store.storageDeletions.values()];

  beforeEach(() => {
    ctx = createTestContext();
    storage = new FakeStorage();
  });

  it("deletes the queued objects after commit and removes their rows", async () => {
    storage.upload("a", 1, "text/plain");
    storage.upload("b", 1, "text/plain");
    await queue(["a", "b"]);
    expect(await drain()).toEqual({ deleted: 2, failed: 0 });
    expect(storage.objects.size).toBe(0);
    expect(rows()).toEqual([]);
  });

  it("an empty queue does nothing", async () => {
    expect(await drain()).toEqual({ deleted: 0, failed: 0 });
    expect(storage.deleted).toEqual([]);
  });

  it("deleting a key whose object is already gone is a success (idempotent)", async () => {
    await queue(["never-existed"]);
    expect(await drain()).toEqual({ deleted: 1, failed: 0 });
    expect(rows()).toEqual([]);
  });

  it("sends each batch in one storage call and works through several batches", async () => {
    await queue(Array.from({ length: 5 }, (_, i) => `k${i}`));
    expect(await drain({ batchSize: 2 })).toEqual({ deleted: 5, failed: 0 });
    expect(storage.deleted.map((keys) => keys.length)).toEqual([2, 2, 1]);
  });

  it("stops after maxBatches so one run cannot starve the caller", async () => {
    await queue(Array.from({ length: 6 }, (_, i) => `k${i}`));
    expect(await drain({ batchSize: 2, maxBatches: 2 })).toEqual({ deleted: 4, failed: 0 });
    expect(rows()).toHaveLength(2);
  });

  it("isolates a failing key: the rest of its batch is still deleted and the failure is reported, not swallowed", async () => {
    storage.poisoned.add("bad");
    await queue(["ok1", "bad", "ok2"]);
    const errors: unknown[] = [];
    const result = await drain({ onError: (error: unknown, key: string) => errors.push([key, error]) });
    expect(result).toEqual({ deleted: 2, failed: 1 });
    expect(rows().map((r) => r.storageKey)).toEqual(["bad"]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as [string, unknown])[0]).toBe("bad");
  });

  it("a failed key waits out its backoff and is retried by a later run", async () => {
    storage.poisoned.add("bad");
    await queue(["bad"]);
    await drain();
    expect(await drain()).toEqual({ deleted: 0, failed: 0 }); // still backing off: not claimed
    storage.poisoned.clear();
    ctx.clock.set(new Date(ctx.clock.now().getTime() + 5 * 60_000));
    expect(await drain()).toEqual({ deleted: 1, failed: 0 });
    expect(rows()).toEqual([]);
  });

  it("parks a key that keeps failing instead of retrying forever, keeping the row for inspection", async () => {
    storage.poisoned.add("bad");
    await queue(["bad"]);
    for (let attempt = 0; attempt < 12; attempt++) {
      await drain();
      ctx.clock.set(new Date(ctx.clock.now().getTime() + 11 * 60_000));
    }
    const [row] = rows();
    expect(row).toMatchObject({ storageKey: "bad", attempts: 10 });
    expect(row!.deadAt).not.toBeNull();
    storage.poisoned.clear();
    expect(await drain()).toEqual({ deleted: 0, failed: 0 });
  });

  it("does not count a row whose lease it lost", async () => {
    await queue(["a"]);
    const slow = { ...storage, delete: async (keys: string[]) => {
      // Another worker finishes the same row while this one is busy deleting.
      ctx.clock.set(new Date(ctx.clock.now().getTime() + 6 * 60_000));
      await ctx.repos.outbox.claim(10);
      await storage.delete(keys);
    } };
    const result = await drainStorageDeletions({ outbox: ctx.repos.outbox, storage: slow as FakeStorage }, {});
    expect(result.deleted).toBe(0);
  });
});
