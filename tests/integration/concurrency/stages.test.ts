import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import { makeCreateStage } from "@/application/use-cases/stages/create-stage";
import { makeRenameStage } from "@/application/use-cases/stages/rename-stage";
import { makeReorderStage } from "@/application/use-cases/stages/reorder-stage";
import { makeSetStageDone } from "@/application/use-cases/stages/set-stage-done";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, OWNER, seedKanban } from "../support/seed";
import { drizzleDeps } from "../support/tx";

// A deadlock or a lost lock shows up as a hung statement: the timeout turns it into a failure.
const handle = connectTestDb(5_000);
const deps = drizzleDeps(handle);
const ROUNDS = 5;

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("stages under real concurrency", () => {
  it("two setStageDone calls on different stages both succeed, serialize, and leave exactly one done stage", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { pipelineId, todo, doing, done } = await seedKanban(deps);
      const inDone = await addTask(deps, done.id);
      const inTodo = await addTask(deps, todo.id);
      const setDone = makeSetStageDone(deps);
      const results = await Promise.allSettled([
        setDone(OWNER, { stageId: todo.id, isDone: true }),
        setDone(OWNER, { stageId: doing.id, isDone: true }),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

      const stages = await deps.repos.stages.listByPipeline(pipelineId);
      const flagged = stages.filter((s) => s.isDone);
      expect(flagged).toHaveLength(1);
      const tasks = await Promise.all([inDone, inTodo].map((t) => deps.repos.tasks.findById(t.id)));
      for (const task of tasks) {
        expect(task?.completedAt !== null).toBe(task?.stageId === flagged[0]!.id);
      }
    }
  });

  it("setStageDone racing the same flag on the same stage is idempotent", async () => {
    const { todo } = await seedKanban(deps);
    const setDone = makeSetStageDone(deps);
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => setDone(OWNER, { stageId: todo.id, isDone: true })));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("two stages reordered into the same gap end with distinct positions", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { pipelineId, todo, doing, done } = await seedKanban(deps);
      const reorder = makeReorderStage(deps);
      const results = await Promise.allSettled([
        reorder(OWNER, { stageId: doing.id, afterStageId: todo.id }),
        reorder(OWNER, { stageId: done.id, afterStageId: todo.id }),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      const stages = await deps.repos.stages.listByPipeline(pipelineId);
      expect(new Set(stages.map((s) => s.position)).size).toBe(stages.length);
      expect(stages[0]!.id).toBe(todo.id);
    }
  });

  it("two renames to the same name: one wins, the other is a ConflictError", async () => {
    const { todo, doing } = await seedKanban(deps);
    const rename = makeRenameStage(deps);
    const results = await Promise.allSettled([
      rename(OWNER, { stageId: todo.id, name: "Review" }),
      rename(OWNER, { stageId: doing.id, name: "review" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConflictError);
  });

  it("two creations of the same stage name: one wins, the other is a ConflictError", async () => {
    const { pipelineId } = await seedKanban(deps);
    const create = makeCreateStage(deps);
    const results = await Promise.allSettled([
      create(OWNER, { pipelineId, name: "QA" }),
      create(OWNER, { pipelineId, name: "qa" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason).toBeInstanceOf(ConflictError);
  });
});
