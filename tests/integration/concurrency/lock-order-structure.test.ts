import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { AppDeps } from "@/application/deps";
import type { Repos } from "@/application/ports/repositories";
import { makeDeleteBoard } from "@/application/use-cases/boards/delete-board";
import { makeAddMember } from "@/application/use-cases/members/add-member";
import { makeRemoveMember } from "@/application/use-cases/members/remove-member";
import { makeDeletePipeline } from "@/application/use-cases/pipelines/delete-pipeline";
import { makeCreatePipeline } from "@/application/use-cases/pipelines/create-pipeline";
import { makeDeleteStage } from "@/application/use-cases/stages/delete-stage";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { makeMoveTask } from "@/application/use-cases/tasks/move-task";
import { makeUpdateTask } from "@/application/use-cases/tasks/update-task";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";
import { actor } from "@tests/support/fixtures";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, OWNER, seedKanban } from "../support/seed";
import { deferred, drizzleDeps, waitUntilBlocked } from "../support/tx";

const handle = connectTestDb(10_000);
/** One attempt only: the unit of work retries deadlocks (40P01), which would hide a lock-order bug. */
const deps = { ...drizzleDeps(handle), uow: new DrizzleUnitOfWork(handle.db, { maxAttempts: 1 }) };
const MEMBER = actor("member");

beforeEach(async () => {
  await resetDb(handle);
});
afterAll(() => handle.close());

type RepoName = Exclude<keyof Repos, "outbox">;

type Gate = { paused: AppDeps; reached: Promise<void>; release: () => void };
type Hook = (tx: Repos, hit: () => Promise<void>) => Repos;

function gated(hook: Hook): Gate {
  const reached = deferred();
  const gate = deferred();
  let armed = true;
  const hit = async () => {
    if (!armed) return;
    armed = false;
    reached.resolve();
    await gate.promise;
  };
  const paused: AppDeps = {
    ...deps,
    uow: { run: <T>(work: Parameters<typeof deps.uow.run<T>>[0]) => deps.uow.run((tx) => work(hook(tx, hit))) },
  };
  return { paused, reached: reached.promise, release: gate.resolve };
}

type Method = (...args: unknown[]) => Promise<unknown>;
const methodOf = (tx: Repos, repo: RepoName, method: string) => (tx[repo] as unknown as Record<string, Method>)[method]!;
const replaced = (tx: Repos, repo: RepoName, method: string, wrapper: Method): Repos =>
  ({ ...tx, [repo]: { ...(tx[repo] as object), [method]: wrapper } }) as Repos;

/** Holds a writer's transaction right BEFORE it calls `repo.method`, with every lock it took so far still held. */
function pausedBefore(repo: RepoName, method: string): Gate {
  return gated((tx, hit) => {
    const original = methodOf(tx, repo, method);
    return replaced(tx, repo, method, async (...args) => {
      await hit();
      return original.apply(tx[repo], args);
    });
  });
}

/**
 * Holds a transaction right AFTER whichever of two locking calls finishes first and before the other one starts, so the
 * test exercises the gap between the two lock acquisitions whatever order the use case takes them in.
 */
function pausedBetween(a: [RepoName, string], b: [RepoName, string]): Gate {
  return gated((tx, hit) => {
    const afterFirst = (target: [RepoName, string]) => {
      const original = methodOf(tx, target[0], target[1]);
      return async (...args: unknown[]) => {
        const result = await original.apply(tx[target[0]], args);
        await hit();
        return result;
      };
    };
    return replaced(replaced(tx, a[0], a[1], afterFirst(a)), b[0], b[1], afterFirst(b));
  });
}

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

/**
 * The writer is frozen mid-transaction; the deleter arrives and blocks behind a lock the writer holds. Releasing the
 * writer must let both finish: if the writer then needs something the deleter already holds, Postgres raises 40P01.
 */
async function race(writer: Gate, start: (paused: AppDeps) => Promise<unknown>, deleter: () => Promise<unknown>) {
  const writing = settle(start(writer.paused));
  await writer.reached;
  const deleting = settle(deleter());
  await waitUntilBlocked(handle);
  writer.release();
  return { written: await writing, deleted: await deleting };
}

async function scenario() {
  const k = await seedKanban(deps);
  const existing = await addTask(deps, k.todo.id);
  return { k, existing };
}

/** Postgres reports a lock cycle as 40P01, on the error itself or on its cause (Drizzle wraps driver errors). */
const noDeadlock = (outcome: object) => {
  const error = (outcome as { error?: unknown }).error as { code?: string; cause?: { code?: string } } | undefined;
  expect([error?.code, error?.cause?.code]).not.toContain("40P01");
};

describe("task writers and parent deletes keep the global lock order (boards, members, pipelines, stages, tasks)", () => {
  it("createTask freezing before its insert while deleteBoard arrives: no deadlock", async () => {
    const { k } = await scenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "insert"),
      (paused) => makeCreateTask(paused)(OWNER, { stageId: k.todo.id, title: "New" }),
      () => makeDeleteBoard(deps)(OWNER, { boardId: k.boardId }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ title: "New" }) });
    expect(deleted).toEqual({ value: undefined });
  });

  it("createTask freezing before its insert while deletePipeline arrives: no deadlock", async () => {
    const { k } = await scenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "insert"),
      (paused) => makeCreateTask(paused)(OWNER, { stageId: k.todo.id, title: "New" }),
      () => makeDeletePipeline(deps)(OWNER, { pipelineId: k.pipelineId }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ title: "New" }) });
    expect(deleted).toEqual({ value: undefined });
  });

  it("createTask freezing before its insert while deleteStage arrives: no deadlock, the new task moves with the rest", async () => {
    const { k } = await scenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "insert"),
      (paused) => makeCreateTask(paused)(OWNER, { stageId: k.todo.id, title: "New" }),
      () => makeDeleteStage(deps)(OWNER, { stageId: k.todo.id, moveToStageId: k.doing.id }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ title: "New" }) });
    expect(deleted).toEqual({ value: undefined });
  });

  it("moveTask holding the pipeline and stages, before it locks the task columns, while deleteBoard arrives: no deadlock", async () => {
    const { k, existing } = await scenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "listByStage"),
      (paused) => makeMoveTask(paused)(OWNER, { taskId: existing.id, toStageId: k.doing.id, toEnd: true }),
      () => makeDeleteBoard(deps)(OWNER, { boardId: k.boardId }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ stageId: k.doing.id }) });
    expect(deleted).toEqual({ value: undefined });
  });

  async function crossScenario() {
    const { k, existing } = await scenario();
    const pipeline = await makeCreatePipeline(deps)(OWNER, { boardId: k.boardId, name: "Backlog" });
    const [siblingTodo] = await deps.repos.stages.listByPipeline(pipeline.id);
    const other = await addTask(deps, siblingTodo!.id);
    return { k, existing, pipeline, siblingTodo: siblingTodo!, other };
  }

  it("two cross-pipeline moves in opposite directions, the first frozen holding only ONE pipeline lock: no deadlock", async () => {
    const { k, existing, siblingTodo, other } = await crossScenario();
    // Frozen right after its first stage-list lock: sorted, that is the lower pipeline id; unsorted, its own origin.
    const { written, deleted } = await race(
      pausedBetween(["stages", "listByPipeline"], ["stages", "listByPipeline"]),
      (paused) => makeMoveTask(paused)(OWNER, { taskId: existing.id, toStageId: siblingTodo.id, toEnd: true }),
      () => makeMoveTask(deps)(OWNER, { taskId: other.id, toStageId: k.todo.id, toEnd: true }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ stageId: siblingTodo.id }) });
    expect(deleted).toEqual({ value: expect.objectContaining({ stageId: k.todo.id }) });
  });

  it("cross-pipeline moves fired in parallel in both directions end in a valid state", async () => {
    const { k, existing, siblingTodo, other } = await crossScenario();
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2 === 0
          ? settle(makeMoveTask(deps)(OWNER, { taskId: existing.id, toStageId: siblingTodo.id, toEnd: true }))
          : settle(makeMoveTask(deps)(OWNER, { taskId: other.id, toStageId: k.todo.id, toEnd: true })),
      ),
    );
    for (const outcome of outcomes) {
      noDeadlock(outcome);
      if ("error" in outcome) expect(outcome.error).toBeInstanceOf(ConflictError);
    }
    const valid = [k.todo.id, siblingTodo.id];
    for (const id of [existing.id, other.id]) {
      const task = await deps.repos.tasks.findById(id);
      expect(valid).toContain(task?.stageId);
      expect(task?.pipelineId).toBe(task?.stageId === k.todo.id ? k.pipelineId : siblingTodo.pipelineId);
    }
  });

  it("cross-pipeline moveTask holding both pipelines while deletePipeline of the destination arrives: no deadlock", async () => {
    const { existing, pipeline, siblingTodo } = await crossScenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "listByStage"),
      (paused) => makeMoveTask(paused)(OWNER, { taskId: existing.id, toStageId: siblingTodo.id, toEnd: true }),
      () => makeDeletePipeline(deps)(OWNER, { pipelineId: pipeline.id }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ stageId: siblingTodo.id }) });
    expect(deleted).toEqual({ value: undefined });
  });

  it("cross-pipeline moveTask holding the stage lists while deleteStage of the destination arrives: no deadlock", async () => {
    const { existing, siblingTodo } = await crossScenario();
    const { written, deleted } = await race(
      pausedBefore("tasks", "listByStage"),
      (paused) => makeMoveTask(paused)(OWNER, { taskId: existing.id, toStageId: siblingTodo.id, toEnd: true }),
      () => makeDeleteStage(deps)(OWNER, { stageId: siblingTodo.id }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(written).toEqual({ value: expect.objectContaining({ stageId: siblingTodo.id }) });
    // The move committed first, so the stage now holds tasks and, without a destination, cannot be deleted.
    expect(deleted).toEqual({ error: expect.any(ConflictError) });
  });

  it("updateTask freezing between its task lock and its assignee check while removeMember arrives: no deadlock", async () => {
    const { k, existing } = await scenario();
    await makeAddMember(deps)(OWNER, { boardId: k.boardId, userId: MEMBER.userId, role: "member" });
    await makeUpdateTask(deps)(OWNER, { taskId: existing.id, assigneeId: MEMBER.userId });
    const { written, deleted } = await race(
      pausedBetween(["members", "find"], ["tasks", "findById"]),
      (paused) => makeUpdateTask(paused)(OWNER, { taskId: existing.id, assigneeId: MEMBER.userId, title: "Renamed" }),
      () => makeRemoveMember(deps)(OWNER, { boardId: k.boardId, userId: MEMBER.userId }),
    );
    noDeadlock(written);
    noDeadlock(deleted);
    expect(deleted).toEqual({ value: undefined });
    // Either order is valid: the update ran first and was then unassigned, or the removal won and the update was refused.
    if ("error" in written) expect(String((written.error as { message?: string }).message)).toMatch(/invalid input|member/i);
  });
});
