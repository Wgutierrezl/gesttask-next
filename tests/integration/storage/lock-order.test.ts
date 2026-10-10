import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeRequestUpload } from "@/application/use-cases/attachments/request-upload";
import { makeDeleteBoard } from "@/application/use-cases/boards/delete-board";
import { makeCreateComment } from "@/application/use-cases/comments/create-comment";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { FakeStorage } from "@tests/support/fake-storage";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, OWNER, seedKanban } from "../support/seed";
import { deferred, drizzleDeps, waitUntilBlocked } from "../support/tx";

const handle = connectTestDb(10_000);
const storage = new FakeStorage();
/** One attempt only: the unit of work retries deadlocks (40P01), which would hide a lock-order bug. */
const deps = { ...drizzleDeps(handle), uow: new DrizzleUnitOfWork(handle.db, { maxAttempts: 1 }) };

beforeEach(async () => {
  await resetDb(handle);
});
afterAll(() => handle.close());

const rows = async (table: "boards" | "comments" | "attachments") =>
  Number((await handle.db.execute<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).rows[0]!.n);
const queued = async () =>
  (await handle.db.execute<{ storage_key: string }>(sql`SELECT storage_key FROM storage_deletions`)).rows.map((r) => r.storage_key);

/** Holds a writer's transaction open right before it inserts its child row, with every lock it needs already taken. */
function pausedBeforeInsert(table: "comments" | "attachments") {
  const reached = deferred();
  const gate = deferred();
  const paused = {
    ...deps,
    uow: {
      run: <T>(work: Parameters<typeof deps.uow.run<T>>[0]) =>
        deps.uow.run((tx) =>
          work({
            ...tx,
            [table]: {
              ...tx[table],
              insert: async (row: never) => {
                reached.resolve();
                await gate.promise;
                return (tx[table].insert as (row: never) => Promise<void>)(row);
              },
            },
          }),
        ),
    },
  };
  return { paused, reached: reached.promise, release: gate.resolve };
}

describe("a board delete and a child writer never deadlock (global lock order: board, then task)", () => {
  async function scenario() {
    const k = await seedKanban(deps);
    const task = await addTask(deps, k.todo.id);
    return { k, task };
  }

  it("createComment holding its locks while deleteBoard arrives: both commit, no 40P01", async () => {
    const { k, task } = await scenario();
    const { paused, reached, release } = pausedBeforeInsert("comments");
    const writing = makeCreateComment(paused, { storage })(OWNER, { taskId: task.id, body: "hello" });
    const settledWriting = writing.then((value) => ({ value }), (error: unknown) => ({ error }));
    await reached;
    const deleting = makeDeleteBoard(deps)(OWNER, { boardId: k.boardId });
    const settledDeleting = deleting.then(() => ({}), (error: unknown) => ({ error }));
    await waitUntilBlocked(handle); // the delete waits for the writer; it must not hold the board while the writer needs it
    release();
    expect(await settledWriting).toEqual({ value: expect.objectContaining({ body: "hello" }) });
    expect(await settledDeleting).toEqual({});
    expect(await rows("boards")).toBe(0);
    expect(await rows("comments")).toBe(0);
  });

  it("requestUpload holding its locks while deleteBoard arrives: both commit, and the pending file is queued", async () => {
    const { k, task } = await scenario();
    const { paused, reached, release } = pausedBeforeInsert("attachments");
    const requesting = makeRequestUpload(paused, { storage, limiter: new InMemoryRateLimiter(deps.clock) })(OWNER, {
      taskId: task.id, fileName: "f.png", contentType: "image/png", size: 10,
    });
    const settledRequest = requesting.then((value) => ({ value }), (error: unknown) => ({ error }));
    await reached;
    const deleting = makeDeleteBoard(deps)(OWNER, { boardId: k.boardId });
    const settledDeleting = deleting.then(() => ({}), (error: unknown) => ({ error }));
    await waitUntilBlocked(handle);
    release();
    const request = (await settledRequest) as { value: { attachmentId: string } };
    expect(request.value.attachmentId).toEqual(expect.any(String));
    expect(await settledDeleting).toEqual({});
    expect(await rows("boards")).toBe(0);
    expect(await rows("attachments")).toBe(0);
    expect(await queued()).toEqual([`boards/${k.boardId}/attachments/${request.value.attachmentId}`]);
  });
});
