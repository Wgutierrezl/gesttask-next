import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/domain/errors";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { FakeStorage } from "@tests/support/fake-storage";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { MEMBER, OWNER, RIVAL, STRANGER, seedKanban } from "@tests/support/fixtures";
import { makeDeleteBoard } from "../boards/delete-board";
import { makeCreateComment } from "../comments/create-comment";
import { makeDeletePipeline } from "../pipelines/delete-pipeline";
import { makeDeleteStage } from "../stages/delete-stage";
import { makeCreateTask } from "../tasks/create-task";
import { makeDeleteTask } from "../tasks/delete-task";
import { makeRequestUpload } from "./request-upload";

/**
 * REQ-CAS-02: every path that deletes rows with attachments below them queues those storage keys in the SAME
 * transaction, so a committed delete always leaves its objects on the outbox and a rolled-back one leaves nothing.
 */
describe("storage cleanup on cascading deletes", () => {
  let ctx: TestContext;
  let storage: FakeStorage;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  const queued = () => [...ctx.store.storageDeletions.values()].map((row) => row.storageKey).sort();

  /** Requests a ticket, plays the browser and attaches the file to a new comment; returns the storage key. */
  async function attach(taskId: string, who = OWNER): Promise<string> {
    const { attachmentId } = await makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(who, {
      taskId, fileName: "f.png", contentType: "image/png", size: 10,
    });
    const row = ctx.store.attachments.get(attachmentId)!;
    storage.upload(row.storageKey, 10, "image/png");
    await makeCreateComment(ctx, { storage })(who, { taskId, body: "file", attachmentIds: [attachmentId] });
    return row.storageKey;
  }
  const newTask = async (stageId: string, title: string) => (await makeCreateTask(ctx)(OWNER, { stageId, title })).id;

  let world: { todoTask: string; progressTask: string; todoKeys: string[]; progressKeys: string[]; pendingKey: string };
  let control: { boardId: string; key: string };

  beforeEach(async () => {
    ctx = createTestContext();
    storage = new FakeStorage();
    k = await seedKanban(ctx);
    const todoTask = await newTask(k.todoId, "todo");
    const progressTask = await newTask(k.progressId, "progress");
    const todoKeys = [await attach(todoTask), await attach(todoTask, MEMBER)];
    const progressKeys = [await attach(progressTask)];
    const pending = await makeRequestUpload(ctx, { storage, limiter: new InMemoryRateLimiter(ctx.clock) })(OWNER, {
      taskId: todoTask, fileName: "p.png", contentType: "image/png", size: 10,
    });
    world = { todoTask, progressTask, todoKeys, progressKeys, pendingKey: ctx.store.attachments.get(pending.attachmentId)!.storageKey };
    const rival = await seedKanban(ctx, RIVAL);
    const rivalTask = (await makeCreateTask(ctx)(RIVAL, { stageId: rival.todoId, title: "rival" })).id;
    control = { boardId: rival.boardId, key: await attach(rivalTask, RIVAL) };
  });

  it("deleting a task queues exactly the keys of its comments' attachments", async () => {
    await makeDeleteTask(ctx)(OWNER, { taskId: world.todoTask });
    expect(queued()).toEqual([...world.todoKeys].sort());
    expect([...ctx.store.attachments.values()].map((a) => a.storageKey)).toEqual(expect.arrayContaining([...world.progressKeys, world.pendingKey, control.key]));
    expect(ctx.store.attachments.size).toBe(world.progressKeys.length + 2);
  });

  it("deleting a pipeline queues the keys of every task below it, not a pending upload with no comment, not other boards", async () => {
    await makeDeletePipeline(ctx)(OWNER, { pipelineId: k.pipelineId });
    expect(queued()).toEqual([...world.todoKeys, ...world.progressKeys].sort());
    expect(queued()).not.toContain(world.pendingKey);
    expect(queued()).not.toContain(control.key);
  });

  it("deleting a board queues everything on it, pending uploads included, and nothing from another board", async () => {
    await makeDeleteBoard(ctx)(OWNER, { boardId: k.boardId });
    expect(queued()).toEqual([...world.todoKeys, ...world.progressKeys, world.pendingKey].sort());
    expect([...ctx.store.attachments.values()].map((a) => a.boardId)).toEqual([control.boardId]);
  });

  it("deleting a stage moves its tasks first, so their attachments stay and nothing is queued", async () => {
    await makeDeleteStage(ctx)(OWNER, { stageId: k.progressId, moveToStageId: k.todoId });
    expect(queued()).toEqual([]);
    expect([...ctx.store.attachments.values()].filter((a) => world.progressKeys.includes(a.storageKey))).toHaveLength(1);
  });

  const paths: [string, (c: TestContext) => Promise<unknown>][] = [
    ["task", (c) => makeDeleteTask(c)(OWNER, { taskId: world.todoTask })],
    ["pipeline", (c) => makeDeletePipeline(c)(OWNER, { pipelineId: k.pipelineId })],
    ["board", (c) => makeDeleteBoard(c)(OWNER, { boardId: k.boardId })],
  ];
  it.each(paths)("if the transaction fails after queueing, deleting the %s changes nothing and queues nothing", async (_scope, run) => {
    const rows = JSON.stringify([...ctx.store.attachments]);
    const comments = ctx.store.comments.size;
    const failing: TestContext = {
      ...ctx,
      uow: {
        run: (work) =>
          ctx.uow.run((tx) => work({ ...tx, boards: { ...tx.boards, delete: boom }, pipelines: { ...tx.pipelines, delete: boom }, tasks: { ...tx.tasks, delete: boom } })),
      },
    };
    await expect(run(failing)).rejects.toThrow("db down");
    expect(queued()).toEqual([]);
    expect(JSON.stringify([...ctx.store.attachments])).toBe(rows);
    expect(ctx.store.comments.size).toBe(comments);
  });

  it("a user who may not delete queues nothing", async () => {
    await expect(makeDeleteTask(ctx)(STRANGER, { taskId: world.todoTask })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeDeleteBoard(ctx)(MEMBER, { boardId: k.boardId })).rejects.toThrow();
    expect(queued()).toEqual([]);
  });

  it("deleting a task that vanished meanwhile answers NotFound instead of silently succeeding", async () => {
    await makeDeleteTask(ctx)(OWNER, { taskId: world.todoTask });
    await expect(makeDeleteTask(ctx)(OWNER, { taskId: world.todoTask })).rejects.toBeInstanceOf(NotFoundError);
  });
});

async function boom(): Promise<never> {
  throw new Error("db down");
}
