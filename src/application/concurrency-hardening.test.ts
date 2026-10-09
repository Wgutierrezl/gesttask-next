import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";
import { isPosition } from "@/domain/value-objects/position";
import { recordTxCalls, withInterleavedWrite } from "@tests/support/race";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { MEMBER, OWNER, buildTask, clearStages, seedKanban } from "@tests/support/fixtures";
import { makeRemoveMember } from "./use-cases/members/remove-member";
import { makeChangeMemberRole } from "./use-cases/members/change-member-role";
import { makeCreateStage } from "./use-cases/stages/create-stage";
import { makeDeleteStage } from "./use-cases/stages/delete-stage";
import { makeReorderStage } from "./use-cases/stages/reorder-stage";
import { makeSetStageDone } from "./use-cases/stages/set-stage-done";
import { makeCreateTask } from "./use-cases/tasks/create-task";
import { makeMoveTask } from "./use-cases/tasks/move-task";

const T1 = "00000000-0000-4000-8000-0000000000a1";
type Kanban = Awaited<ReturnType<typeof seedKanban>>;

describe("concurrency hardening", () => {
  let ctx: TestContext;
  let k: Kanban;
  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
  });

  const put = (id: string, stageId: string, position = "a0") =>
    void ctx.store.tasks.set(id, buildTask({ id, stageId, pipelineId: k.pipelineId, boardId: k.boardId, position }));

  describe("createTask re-reads its stage and assignee inside the transaction", () => {
    it("setStageDone racing createTask: the new task follows the stage's fresh done flag", async () => {
      const racing = withInterleavedWrite(ctx, (store) => {
        store.stages.set(k.doneId, { ...store.stages.get(k.doneId)!, isDone: false });
        store.stages.set(k.progressId, { ...store.stages.get(k.progressId)!, isDone: true });
      });
      const task = await makeCreateTask(racing)(OWNER, { stageId: k.progressId, title: "T" });
      expect(task.completedAt).toEqual(ctx.clock.now());
    });

    it("a stage that was unflagged meanwhile does not complete the new task", async () => {
      const racing = withInterleavedWrite(ctx, (store) =>
        void store.stages.set(k.doneId, { ...store.stages.get(k.doneId)!, isDone: false }),
      );
      expect((await makeCreateTask(racing)(OWNER, { stageId: k.doneId, title: "T" })).completedAt).toBeNull();
    });

    it("answers NotFound when the stage vanished before the transaction", async () => {
      const racing = withInterleavedWrite(ctx, (store) => void store.stages.delete(k.todoId));
      await expect(makeCreateTask(racing)(OWNER, { stageId: k.todoId, title: "T" })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("removeMember racing createTask: the removed assignee is rejected and nothing is inserted", async () => {
      const racing = withInterleavedWrite(ctx, (store) => void store.members.delete(`${k.boardId}:${MEMBER.userId}`));
      await expect(
        makeCreateTask(racing)(OWNER, { stageId: k.todoId, title: "T", assigneeId: MEMBER.userId }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(ctx.store.tasks.size).toBe(0);
    });
  });

  describe("positionAtEnd self-heals instead of throwing", () => {
    const MALFORMED = "~bad";

    it("createTask rebalances a column whose last key is malformed", async () => {
      put("t1", k.todoId, "a0");
      put("t2", k.todoId, MALFORMED);
      const created = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "T" });
      const column = [...ctx.store.tasks.values()].filter((t) => t.stageId === k.todoId);
      expect(column.every((t) => isPosition(t.position))).toBe(true);
      const ordered = [...column].sort((a, b) => (a.position < b.position ? -1 : 1)).map((t) => t.id);
      expect(ordered).toEqual(["t1", "t2", created.id]);
    });

    it("createStage rebalances a pipeline whose last stage key is malformed", async () => {
      ctx.store.stages.set(k.doneId, { ...ctx.store.stages.get(k.doneId)!, position: MALFORMED });
      const stage = await makeCreateStage(ctx)(OWNER, { pipelineId: k.pipelineId, name: "QA" });
      const stages = [...ctx.store.stages.values()];
      expect(stages.every((s) => isPosition(s.position))).toBe(true);
      expect(stages.sort((a, b) => (a.position < b.position ? -1 : 1)).at(-1)?.id).toBe(stage.id);
    });

    it("deleteStage rebalances the destination column when moving tasks into a malformed one", async () => {
      put("t1", k.todoId, "a0");
      put("t2", k.progressId, MALFORMED);
      await makeDeleteStage(ctx)(OWNER, { stageId: k.todoId, moveToStageId: k.progressId });
      const column = [...ctx.store.tasks.values()].filter((t) => t.stageId === k.progressId);
      expect(column.every((t) => isPosition(t.position))).toBe(true);
      expect(column.sort((a, b) => (a.position < b.position ? -1 : 1)).map((t) => t.id)).toEqual(["t2", "t1"]);
    });
  });

  describe("deleting the done stage", () => {
    it("is rejected with Conflict and changes nothing", async () => {
      put("t1", k.doneId);
      const before = structuredClone([...ctx.store.stages.entries()]);
      const failure = await makeDeleteStage(ctx)(OWNER, { stageId: k.doneId, moveToStageId: k.todoId }).catch((e) => e);
      expect(failure).toBeInstanceOf(ConflictError);
      expect((failure as Error).message).toMatch(/move the done flag/i);
      expect([...ctx.store.stages.entries()]).toEqual(before);
      expect(ctx.store.tasks.get("t1")?.stageId).toBe(k.doneId);
    });

    it("allows deleting it once the flag moved to another stage", async () => {
      await makeSetStageDone(ctx)(OWNER, { stageId: k.progressId, isDone: true });
      await makeDeleteStage(ctx)(OWNER, { stageId: k.doneId });
      expect(ctx.store.stages.has(k.doneId)).toBe(false);
    });
  });

  describe("global lock order: parent before child, lists before their rows, rows by primary key", () => {
    const firstOf = (calls: string[], prefix: string) => calls.findIndex((c) => c.startsWith(prefix));

    it("setStageDone locks the stage list and never a single stage row first", async () => {
      const spy = recordTxCalls(ctx);
      await makeSetStageDone(spy.ctx)(OWNER, { stageId: k.progressId, isDone: true });
      expect(spy.calls[0]).toBe("stages.listByPipeline");
      expect(spy.calls).not.toContain("stages.findById");
    });

    it.each([
      ["reorderStage", (c: TestContext, k: Kanban) => makeReorderStage(c)(OWNER, { stageId: k.todoId, afterStageId: k.doneId }), null],
      ["deleteStage", (c: TestContext, k: Kanban) => makeDeleteStage(c)(OWNER, { stageId: k.todoId, moveToStageId: k.progressId }), "tasks."],
      ["moveTask", (c: TestContext, k: Kanban) => makeMoveTask(c)(OWNER, { taskId: T1, toStageId: k.progressId, afterTaskId: null }), "tasks."],
    ])("%s locks the stage list first and every stage before any task row", async (_name, run, taskPrefix) => {
      put(T1, k.todoId);
      const spy = recordTxCalls(ctx);
      await run(spy.ctx, k);
      expect(spy.calls[0]).toBe("stages.listByPipeline");
      expect(spy.calls).not.toContain("stages.findById");
      if (taskPrefix) expect(spy.calls.findLastIndex((c) => c === "stages.listByPipeline")).toBeLessThan(firstOf(spy.calls, taskPrefix));
    });

    it.each([
      ["removeMember", (c: TestContext, boardId: string) => makeRemoveMember(c)(OWNER, { boardId, userId: "co-owner" })],
      ["changeMemberRole", (c: TestContext, boardId: string) => makeChangeMemberRole(c)(OWNER, { boardId, userId: "co-owner", role: "member" })],
    ])("%s locks the owner rows before the target member", async (_name, run) => {
      await ctx.repos.members.insert({ boardId: k.boardId, userId: "co-owner", role: "owner" });
      const spy = recordTxCalls(ctx);
      await run(spy.ctx, k.boardId);
      expect(firstOf(spy.calls, "members.countByRole")).toBeGreaterThanOrEqual(0);
      expect(firstOf(spy.calls, "members.countByRole")).toBeLessThan(firstOf(spy.calls, "members.find"));
    });
  });

  describe("transactional re-reads of stages and columns", () => {
    it("deleteStage answers NotFound when the stage vanished, and when the destination is outside the pipeline", async () => {
      const gone = withInterleavedWrite(ctx, (store) => void store.stages.delete(k.todoId));
      await expect(makeDeleteStage(gone)(OWNER, { stageId: k.todoId })).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        makeDeleteStage(ctx)(OWNER, { stageId: k.progressId, moveToStageId: "00000000-0000-4000-8000-0000000000ff" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("deleteStage with tasks needs a destination", async () => {
      put(T1, k.todoId);
      await expect(makeDeleteStage(ctx)(OWNER, { stageId: k.todoId })).rejects.toBeInstanceOf(ConflictError);
      expect(ctx.store.stages.has(k.todoId)).toBe(true);
    });

    it("moveTask answers Conflict when the task changed column since the pre-flight read", async () => {
      put(T1, k.todoId);
      const racing = withInterleavedWrite(ctx, (store) => void Object.assign(store.tasks.get(T1)!, { stageId: k.progressId }));
      await expect(
        makeMoveTask(racing)(OWNER, { taskId: T1, toStageId: k.doneId, afterTaskId: null }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(ctx.store.tasks.get(T1)?.stageId).toBe(k.progressId);
    });
  });

  it("an empty pipeline still accepts its first task and stage", async () => {
    clearStages(ctx, k.pipelineId);
    const stage = await makeCreateStage(ctx)(OWNER, { pipelineId: k.pipelineId, name: "Only" });
    const task = await makeCreateTask(ctx)(OWNER, { stageId: stage.id, title: "T" });
    expect(task.stageId).toBe(stage.id);
  });
});
