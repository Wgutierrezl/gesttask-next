import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/domain/errors";
import { makeChangeMemberRole } from "@/application/use-cases/members/change-member-role";
import { makeRemoveMember } from "@/application/use-cases/members/remove-member";
import { makeSetStageDone } from "@/application/use-cases/stages/set-stage-done";
import { makeMoveTask } from "@/application/use-cases/tasks/move-task";
import { makeUpdateTask } from "@/application/use-cases/tasks/update-task";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, OWNER, seedKanban } from "../support/seed";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb(5_000);
const deps = drizzleDeps(handle);
const ROUNDS = 8;

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const statuses = (results: PromiseSettledResult<unknown>[]) => results.map((r) => r.status);

describe("tasks under real concurrency", () => {
  it("updateTask racing moveTask keeps both writes (no lost update)", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { todo, doing } = await seedKanban(deps);
      const task = await addTask(deps, todo.id, { title: "before" });
      const results = await Promise.allSettled([
        makeUpdateTask(deps)(OWNER, { taskId: task.id, title: "after", priority: "high" }),
        makeMoveTask(deps)(OWNER, { taskId: task.id, toStageId: doing.id, afterTaskId: null }),
      ]);
      expect(statuses(results)).toEqual(["fulfilled", "fulfilled"]);
      const final = await deps.repos.tasks.findById(task.id);
      expect(final).toMatchObject({ title: "after", priority: "high", stageId: doing.id });
    }
  });

  it("two tasks moved into the same gap end with distinct positions and a stable order", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { todo, doing } = await seedKanban(deps);
      const anchor = await addTask(deps, doing.id);
      const [a, b] = [await addTask(deps, todo.id), await addTask(deps, todo.id)];
      const move = makeMoveTask(deps);
      const results = await Promise.allSettled([
        move(OWNER, { taskId: a.id, toStageId: doing.id, afterTaskId: anchor.id }),
        move(OWNER, { taskId: b.id, toStageId: doing.id, afterTaskId: anchor.id }),
      ]);
      expect(statuses(results)).toEqual(["fulfilled", "fulfilled"]);
      const column = await deps.repos.tasks.listByStage(doing.id);
      expect(column).toHaveLength(3);
      expect(new Set(column.map((t) => t.position)).size).toBe(3);
      expect(column[0]!.id).toBe(anchor.id);
    }
  });

  it("tasks swapping columns in opposite directions never deadlock", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { todo, doing } = await seedKanban(deps);
      const [a, b] = [await addTask(deps, todo.id), await addTask(deps, doing.id)];
      const move = makeMoveTask(deps);
      const results = await Promise.allSettled([
        move(OWNER, { taskId: a.id, toStageId: doing.id, afterTaskId: null }),
        move(OWNER, { taskId: b.id, toStageId: todo.id, afterTaskId: null }),
      ]);
      expect(statuses(results)).toEqual(["fulfilled", "fulfilled"]);
      expect((await deps.repos.tasks.findById(a.id))?.stageId).toBe(doing.id);
      expect((await deps.repos.tasks.findById(b.id))?.stageId).toBe(todo.id);
    }
  });

  it("createTask racing setStageDone never leaves a task whose completion contradicts its stage", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { pipelineId, todo, done } = await seedKanban(deps);
      const results = await Promise.allSettled([
        makeCreateTask(deps)(OWNER, { stageId: todo.id, title: "racing" }),
        makeSetStageDone(deps)(OWNER, { stageId: todo.id, isDone: true }),
      ]);
      expect(statuses(results)).toEqual(["fulfilled", "fulfilled"]);
      const stages = await deps.repos.stages.listByPipeline(pipelineId);
      expect(stages.filter((s) => s.isDone).map((s) => s.id)).toEqual([todo.id]);
      expect(stages.find((s) => s.id === done.id)?.isDone).toBe(false);
      const tasks = await deps.repos.tasks.listByPipeline(pipelineId, { limit: 10, offset: 0 });
      for (const task of tasks) expect(task.completedAt !== null).toBe(task.stageId === todo.id);
    }
  });

  it("createTask racing removeMember never leaves a task assigned to a removed member", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { boardId, todo } = await seedKanban(deps);
      await deps.repos.members.insert({ boardId, userId: "worker", role: "member" });
      const results = await Promise.allSettled([
        makeCreateTask(deps)(OWNER, { stageId: todo.id, title: "t", assigneeId: "worker" }),
        makeRemoveMember(deps)(OWNER, { boardId, userId: "worker" }),
      ]);
      expect(results[1]!.status).toBe("fulfilled");
      if (results[0]!.status === "rejected") {
        expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
      }
      const tasks = await deps.repos.tasks.listByStage(todo.id);
      expect(tasks.every((t) => t.assigneeId === null)).toBe(true);
      expect(await deps.repos.members.find(boardId, "worker")).toBeNull();
    }
  });
});

describe("the last owner under real concurrency", () => {
  it("two owners demoting each other: exactly one succeeds and an owner always remains", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { boardId } = await seedKanban(deps);
      await deps.repos.members.insert({ boardId, userId: "second", role: "owner" });
      const change = makeChangeMemberRole(deps);
      const results = await Promise.allSettled([
        change({ userId: "second", isGuest: false }, { boardId, userId: "owner", role: "member" }),
        change(OWNER, { boardId, userId: "second", role: "member" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await deps.repos.members.countByRole(boardId, "owner")).toBe(1);
    }
  });

  it("an owner leaving while the other is demoted: exactly one succeeds and an owner always remains", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { boardId } = await seedKanban(deps);
      await deps.repos.members.insert({ boardId, userId: "second", role: "owner" });
      const results = await Promise.allSettled([
        makeRemoveMember(deps)({ userId: "second", isGuest: false }, { boardId, userId: "owner" }),
        makeChangeMemberRole(deps)(OWNER, { boardId, userId: "second", role: "guest" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await deps.repos.members.countByRole(boardId, "owner")).toBe(1);
    }
  });
});
