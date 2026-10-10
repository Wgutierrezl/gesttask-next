import { beforeEach, describe, expect, it } from "vitest";
import type { Attachment } from "@/domain/entities/comment";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { FakeStorage } from "@tests/support/fake-storage";
import { OWNER, seedKanban } from "@tests/support/fixtures";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { PENDING_UPLOAD_TTL_MS } from "./attachment-policy";
import { drainStorageDeletions } from "./drain-storage-deletions";
import { sweepPendingUploads } from "./sweep-pending-uploads";
import { makeCreateTask } from "./use-cases/tasks/create-task";
import { makeRequestUpload } from "./use-cases/attachments/request-upload";
import { makeCreateComment } from "./use-cases/comments/create-comment";

describe("sweepPendingUploads (REQ-ATT-06, REQ-CAS-02)", () => {
  let ctx: TestContext;
  let storage: FakeStorage;
  let taskId: string;
  const sweep = (options = {}) => sweepPendingUploads({ uow: ctx.uow, clock: ctx.clock }, options);
  const advance = (ms: number) => ctx.clock.set(new Date(ctx.clock.now().getTime() + ms));
  const request = async (): Promise<Attachment> => {
    const { attachmentId } = await makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(OWNER, {
      taskId, fileName: "a.png", contentType: "image/png", size: 10,
    });
    const row = ctx.store.attachments.get(attachmentId)!;
    storage.upload(row.storageKey, 10, "image/png");
    return row;
  };

  beforeEach(async () => {
    ctx = createTestContext();
    storage = new FakeStorage();
    const k = await seedKanban(ctx);
    taskId = (await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "Task" })).id;
  });

  it("queues the keys of abandoned pending uploads and deletes their rows in one step, then the drain removes the objects", async () => {
    const abandoned = await request();
    advance(PENDING_UPLOAD_TTL_MS + 1);
    expect(await sweep()).toEqual({ swept: 1 });
    expect(ctx.store.attachments.has(abandoned.id)).toBe(false);
    expect([...ctx.store.storageDeletions.values()].map((d) => d.storageKey)).toEqual([abandoned.storageKey]);
    expect(storage.objects.has(abandoned.storageKey)).toBe(true);
    expect(await drainStorageDeletions({ outbox: ctx.repos.outbox, storage })).toEqual({ deleted: 1, failed: 0 });
    expect(storage.objects.has(abandoned.storageKey)).toBe(false);
  });

  it("leaves uploads that are still inside their hour (the limit included) and uploads already attached to a comment", async () => {
    const attached = await request();
    await makeCreateComment(ctx, { storage })(OWNER, { taskId, body: "with file", attachmentIds: [attached.id] });
    const recent = await request();
    advance(PENDING_UPLOAD_TTL_MS);
    expect(await sweep()).toEqual({ swept: 0 });
    expect(ctx.store.attachments.get(recent.id)?.status).toBe("pending");
    advance(PENDING_UPLOAD_TTL_MS * 10);
    expect(await sweep()).toEqual({ swept: 1 });
    expect(ctx.store.attachments.get(attached.id)?.status).toBe("confirmed");
    expect(ctx.store.attachments.has(recent.id)).toBe(false);
  });

  it("works through several batches and stops at maxBatches", async () => {
    for (let i = 0; i < 5; i++) await request();
    advance(PENDING_UPLOAD_TTL_MS + 1);
    expect(await sweep({ batchSize: 2, maxBatches: 2 })).toEqual({ swept: 4 });
    expect(await sweep({ batchSize: 2 })).toEqual({ swept: 1 });
    expect(await sweep()).toEqual({ swept: 0 });
    expect(ctx.store.storageDeletions.size).toBe(5);
  });

  it("rolls the delete back when the keys cannot be queued", async () => {
    const abandoned = await request();
    advance(PENDING_UPLOAD_TTL_MS + 1);
    const broken: TestContext = {
      ...ctx,
      uow: { run: (work) => ctx.uow.run((tx) => work({ ...tx, outbox: { ...tx.outbox, enqueue: async () => { throw new Error("db down"); } } })) },
    };
    await expect(sweepPendingUploads({ uow: broken.uow, clock: ctx.clock }, {})).rejects.toThrow("db down");
    expect(ctx.store.attachments.has(abandoned.id)).toBe(true);
    expect(ctx.store.storageDeletions.size).toBe(0);
  });
});
