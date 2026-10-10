import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/domain/errors";
import { makeRequestUpload } from "@/application/use-cases/attachments/request-upload";
import { makeDeleteBoard } from "@/application/use-cases/boards/delete-board";
import { makeCreateComment } from "@/application/use-cases/comments/create-comment";
import { makeDeleteComment } from "@/application/use-cases/comments/delete-comment";
import { makeDeletePipeline } from "@/application/use-cases/pipelines/delete-pipeline";
import { makeDeleteStage } from "@/application/use-cases/stages/delete-stage";
import { makeDeleteTask } from "@/application/use-cases/tasks/delete-task";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { FakeStorage } from "@tests/support/fake-storage";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, OWNER, seedKanban } from "../support/seed";
import { deferred, drizzleDeps, waitUntilBlocked } from "../support/tx";

const handle = connectTestDb(5_000);
const deps = drizzleDeps(handle);
const storage = new FakeStorage();
/** A fresh limiter per request: these tests are about deletes, not about the hourly upload rate. */
const fresh = () => new InMemoryRateLimiter(deps.clock);

beforeEach(async () => {
  await resetDb(handle);
});
afterAll(() => handle.close());

const queued = async () =>
  (await handle.db.execute<{ storage_key: string }>(sql`SELECT storage_key FROM storage_deletions ORDER BY storage_key`)).rows.map((r) => r.storage_key);
const count = async (table: "attachments" | "comments") =>
  Number((await handle.db.execute<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).rows[0]!.n);

/** Request a ticket, play the browser, then attach the file to a new comment; resolves to the storage key. */
async function attach(taskId: string): Promise<{ key: string; commentId: string }> {
  const { attachmentId } = await makeRequestUpload(deps, { storage, limiter: fresh() })(OWNER, { taskId, fileName: "f.png", contentType: "image/png", size: 10 });
  const [row] = await deps.repos.attachments.findManyByIds([attachmentId]);
  storage.upload(row!.storageKey, 10, "image/png");
  const comment = await makeCreateComment(deps, { storage })(OWNER, { taskId, body: "file", attachmentIds: [attachmentId] });
  return { key: row!.storageKey, commentId: comment.id };
}

async function world() {
  const k = await seedKanban(deps);
  const task = await addTask(deps, k.todo.id);
  const other = await addTask(deps, k.doing.id);
  const keys = [(await attach(task.id)).key, (await attach(task.id)).key];
  const otherKey = (await attach(other.id)).key;
  const pending = await makeRequestUpload(deps, { storage, limiter: fresh() })(OWNER, { taskId: task.id, fileName: "p.png", contentType: "image/png", size: 10 });
  const [pendingRow] = await deps.repos.attachments.findManyByIds([pending.attachmentId]);
  return { k, task, other, keys, otherKey, pendingKey: pendingRow!.storageKey };
}

describe("cascading deletes queue storage keys in their own transaction (REQ-CAS-02) on Postgres", () => {
  it("deleteComment", async () => {
    const k = await seedKanban(deps);
    const task = await addTask(deps, k.todo.id);
    const doomed = await attach(task.id);
    const kept = await attach(task.id);
    await makeDeleteComment(deps)(OWNER, { commentId: doomed.commentId });
    expect(await queued()).toEqual([doomed.key]);
    expect(await count("attachments")).toBe(1);
    expect((await deps.repos.attachments.keysUnder({ taskId: task.id }))).toEqual([kept.key]);
  });

  it("deleteTask", async () => {
    const w = await world();
    await makeDeleteTask(deps)(OWNER, { taskId: w.task.id });
    expect(await queued()).toEqual([...w.keys].sort());
    expect(await deps.repos.attachments.keysUnder({ taskId: w.other.id })).toEqual([w.otherKey]);
  });

  it("deleteStage after its tasks moved queues nothing and keeps their files", async () => {
    const w = await world();
    await makeDeleteStage(deps)(OWNER, { stageId: w.k.doing.id, moveToStageId: w.k.todo.id });
    expect(await queued()).toEqual([]);
    expect(await deps.repos.attachments.keysUnder({ taskId: w.other.id })).toEqual([w.otherKey]);
  });

  it("deletePipeline", async () => {
    const w = await world();
    await makeDeletePipeline(deps)(OWNER, { pipelineId: w.k.pipelineId });
    expect(await queued()).toEqual([...w.keys, w.otherKey].sort());
    expect(await count("comments")).toBe(0);
    expect(await count("attachments")).toBe(1); // the pending upload has no comment: it belongs to the board, not the pipeline
  });

  it("deleteBoard queues every key on the board, pending uploads included", async () => {
    const w = await world();
    await makeDeleteBoard(deps)(OWNER, { boardId: w.k.boardId });
    expect(await queued()).toEqual([...w.keys, w.otherKey, w.pendingKey].sort());
    expect(await count("attachments")).toBe(0);
  });

  it("rolls the queue back together with the delete when the transaction fails", async () => {
    const w = await world();
    const failing = {
      ...deps,
      uow: {
        run: <T>(work: Parameters<typeof deps.uow.run<T>>[0]) =>
          deps.uow.run(async (tx) => work({ ...tx, tasks: { ...tx.tasks, delete: async () => { throw new Error("db down"); } } })),
      },
    };
    await expect(makeDeleteTask(failing)(OWNER, { taskId: w.task.id })).rejects.toThrow("db down");
    expect(await queued()).toEqual([]);
    expect(await count("attachments")).toBe(4);
  });

  describe("concurrent writers cannot slip an object past the queue", () => {
    /** Runs the delete up to the moment its keys are queued, then holds the transaction open until `release`. */
    function pausedAfterQueueing() {
      const reached = deferred();
      const gate = deferred();
      const paused = {
        ...deps,
        uow: {
          run: <T>(work: Parameters<typeof deps.uow.run<T>>[0]) =>
            deps.uow.run((tx) =>
              work({
                ...tx,
                outbox: {
                  ...tx.outbox,
                  enqueue: async (keys: string[]) => {
                    await tx.outbox.enqueue(keys);
                    reached.resolve();
                    await gate.promise;
                  },
                },
              }),
            ),
        },
      };
      return { paused, reached: reached.promise, release: gate.resolve };
    }

    it("a comment with a file cannot be created on a task whose delete already read its keys", async () => {
      const k = await seedKanban(deps);
      const task = await addTask(deps, k.todo.id);
      const { attachmentId } = await makeRequestUpload(deps, { storage, limiter: fresh() })(OWNER, { taskId: task.id, fileName: "f.png", contentType: "image/png", size: 10 });
      const [row] = await deps.repos.attachments.findManyByIds([attachmentId]);
      storage.upload(row!.storageKey, 10, "image/png");
      const { paused, reached, release } = pausedAfterQueueing();
      const deleting = makeDeleteTask(paused)(OWNER, { taskId: task.id });
      await reached;
      const commenting = makeCreateComment(deps, { storage })(OWNER, { taskId: task.id, body: "late", attachmentIds: [attachmentId] });
      const outcome = commenting.then(() => "created", (error: unknown) => error);
      await waitUntilBlocked(handle); // the comment waits on the task lock instead of committing an unqueued file
      release();
      await deleting;
      expect(await outcome).toBeInstanceOf(NotFoundError);
      expect(await queued()).toEqual([]); // the pending upload was never part of a comment
      expect(await count("comments")).toBe(0);
    });

    it("an upload request cannot add a pending file to a board whose delete already read its keys", async () => {
      const k = await seedKanban(deps);
      const task = await addTask(deps, k.todo.id);
      const { paused, reached, release } = pausedAfterQueueing();
      const deleting = makeDeleteBoard(paused)(OWNER, { boardId: k.boardId });
      await reached;
      const requesting = makeRequestUpload(deps, { storage, limiter: fresh() })(OWNER, { taskId: task.id, fileName: "f.png", contentType: "image/png", size: 10 });
      const outcome = requesting.then(() => "issued", (error: unknown) => error);
      await waitUntilBlocked(handle); // the insert waits on the board lock instead of committing an unqueued row
      release();
      await deleting;
      expect(await outcome).toBeInstanceOf(NotFoundError);
      expect(await count("attachments")).toBe(0);
    });
  });
});
