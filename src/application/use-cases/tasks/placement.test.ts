import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, buildTask, seedKanban } from "@tests/support/fixtures";
import { makeCreateBoard } from "../boards/create-board";
import { makeCreatePipeline } from "../pipelines/create-pipeline";
import { makeCreateStage } from "../stages/create-stage";
import { makeCreateTask } from "./create-task";
import { makeMoveTask } from "./move-task";
import { makeReorderTask } from "./reorder-task";

describe("task placement", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  const add = (title: string, stageId = k.todoId) => makeCreateTask(ctx)(OWNER, { stageId, title });
  const order = async (stageId: string) => (await ctx.repos.tasks.listByStage(stageId)).map((t) => t.title);
  const ghost = "00000000-0000-4000-8000-0000000000ff";

  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
  });

  describe("moveTask (REQ-TSK-03, REQ-TSK-04)", () => {
    it("inserts after a given task, at the top, and into an empty stage", async () => {
      const [a, b] = [await add("A"), await add("B")];
      const x = await add("X", k.doneId);
      const y = await add("Y", k.doneId);
      await makeMoveTask(ctx)(OWNER, { taskId: x.id, toStageId: k.todoId, afterTaskId: a.id });
      expect(await order(k.todoId)).toEqual(["A", "X", "B"]);
      await makeMoveTask(ctx)(OWNER, { taskId: y.id, toStageId: k.todoId, afterTaskId: null });
      expect(await order(k.todoId)).toEqual(["Y", "A", "X", "B"]);
      await makeMoveTask(ctx)(OWNER, { taskId: b.id, toStageId: k.doneId, afterTaskId: null });
      expect(await order(k.doneId)).toEqual(["B"]);
      expect((await ctx.repos.tasks.findById(b.id))?.stageId).toBe(k.doneId);
    });

    it("treats moving within the same stage as a reorder, not an error", async () => {
      const [a, b, c] = [await add("A"), await add("B"), await add("C")];
      await makeMoveTask(ctx)(OWNER, { taskId: c.id, toStageId: k.todoId, afterTaskId: null });
      expect(await order(k.todoId)).toEqual(["C", "A", "B"]);
      await makeReorderTask(ctx)(OWNER, { taskId: c.id, afterTaskId: b.id });
      expect(await order(k.todoId)).toEqual(["A", "B", "C"]);
      await makeReorderTask(ctx)(OWNER, { taskId: a.id, afterTaskId: c.id });
      expect(await order(k.todoId)).toEqual(["B", "C", "A"]);
    });

    it("sets completedAt when entering the final stage and clears it on leaving", async () => {
      const t = await add("T");
      const done = await makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.doneId, afterTaskId: null });
      expect(done.completedAt).toEqual(ctx.clock.now());
      ctx.clock.set(new Date("2026-10-20T00:00:00.000Z"));
      const same = await makeReorderTask(ctx)(OWNER, { taskId: t.id, afterTaskId: null });
      expect(same.completedAt).toEqual(new Date("2026-10-09T12:00:00.000Z"));
      const back = await makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.todoId, afterTaskId: null });
      expect(back.completedAt).toBeNull();
    });

    it("answers NotFound for destinations in another board or pipeline and leaves the task untouched", async () => {
      const t = await add("T");
      const other = await makeCreateBoard(ctx)(STRANGER, { name: "Other" });
      const foreignPipeline = await makeCreatePipeline(ctx)(STRANGER, { boardId: other.id, name: "P" });
      const foreignStage = await makeCreateStage(ctx)(STRANGER, { pipelineId: foreignPipeline.id, name: "S" });
      const sibling = await makeCreatePipeline(ctx)(OWNER, { boardId: k.boardId, name: "P2" });
      const siblingStage = await makeCreateStage(ctx)(OWNER, { pipelineId: sibling.id, name: "S" });
      for (const toStageId of [foreignStage.id, siblingStage.id, ghost]) {
        await expect(makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId, afterTaskId: null })).rejects.toBeInstanceOf(
          NotFoundError,
        );
      }
      expect(await ctx.repos.tasks.findById(t.id)).toMatchObject({ stageId: k.todoId, position: t.position });
    });

    it("answers NotFound when the anchor task is unknown, self, or in another stage", async () => {
      const [a, b] = [await add("A"), await add("B", k.doneId)];
      for (const afterTaskId of [ghost, a.id, b.id]) {
        await expect(makeMoveTask(ctx)(OWNER, { taskId: a.id, toStageId: k.todoId, afterTaskId })).rejects.toBeInstanceOf(
          NotFoundError,
        );
      }
      await expect(makeReorderTask(ctx)(OWNER, { taskId: a.id, afterTaskId: b.id })).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each([
      ["guest", GUEST, ForbiddenError],
      ["stranger", STRANGER, NotFoundError],
    ] as const)("denies %s with no effect, and lets members move", async (_l, who, error) => {
      const t = await add("T");
      await expect(makeMoveTask(ctx)(who, { taskId: t.id, toStageId: k.doneId, afterTaskId: null })).rejects.toBeInstanceOf(error);
      await expect(makeReorderTask(ctx)(who, { taskId: t.id, afterTaskId: null })).rejects.toBeInstanceOf(error);
      expect((await ctx.repos.tasks.findById(t.id))?.stageId).toBe(k.todoId);
      await makeMoveTask(ctx)(MEMBER, { taskId: t.id, toStageId: k.doneId, afterTaskId: null });
      expect((await ctx.repos.tasks.findById(t.id))?.stageId).toBe(k.doneId);
    });

    it("validates identifiers", async () => {
      await expect(makeMoveTask(ctx)(OWNER, { taskId: "nope", toStageId: k.doneId, afterTaskId: null })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("position integrity", () => {
    it("keeps a strict total order across repeated moves into the same gap", async () => {
      const [a, b] = [await add("A"), await add("B")];
      for (let i = 0; i < 40; i++) {
        const t = await add(`N${i}`, k.doneId);
        await makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.todoId, afterTaskId: a.id });
      }
      const tasks = await ctx.repos.tasks.listByStage(k.todoId);
      expect(tasks[0]?.id).toBe(a.id);
      expect(tasks.at(-1)?.id).toBe(b.id);
      expect(new Set(tasks.map((t) => t.position)).size).toBe(tasks.length);
    });

    it("rebalances transparently when concurrent writes left duplicate positions", async () => {
      const ids = { a: "00000000-0000-4000-8000-00000000000a", b: "00000000-0000-4000-8000-00000000000b" };
      for (const [title, id] of Object.entries(ids)) {
        const base = { id, title, stageId: k.todoId, pipelineId: k.pipelineId, boardId: k.boardId };
        await ctx.repos.tasks.insert(buildTask({ ...base, position: "V" }));
      }
      const moving = await add("M", k.doneId);
      await makeMoveTask(ctx)(OWNER, { taskId: moving.id, toStageId: k.todoId, afterTaskId: ids.a });
      expect((await ctx.repos.tasks.listByStage(k.todoId)).map((t) => t.title)).toEqual(["a", "M", "b"]);
      const positions = (await ctx.repos.tasks.listByStage(k.todoId)).map((t) => t.position);
      expect(new Set(positions).size).toBe(3);
    });
  });
});
