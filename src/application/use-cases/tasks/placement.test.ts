import { beforeEach, describe, expect, it } from "vitest";
import { MAX_POSITION_LENGTH, generatePositions } from "@/domain/value-objects/position";
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

    it("answers NotFound when the anchor task is unknown or in another stage", async () => {
      const [a, b] = [await add("A"), await add("B", k.doneId)];
      for (const afterTaskId of [ghost, b.id]) {
        await expect(makeMoveTask(ctx)(OWNER, { taskId: a.id, toStageId: k.todoId, afterTaskId })).rejects.toBeInstanceOf(
          NotFoundError,
        );
      }
      await expect(makeReorderTask(ctx)(OWNER, { taskId: a.id, afterTaskId: b.id })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("treats dropping a task on itself as a no-op that writes nothing", async () => {
      const [a, b] = [await add("A"), await add("B")];
      const before = JSON.stringify([...ctx.store.tasks]);
      ctx.clock.set(new Date("2026-10-20T00:00:00.000Z"));
      const moved = await makeMoveTask(ctx)(OWNER, { taskId: a.id, toStageId: k.todoId, afterTaskId: a.id });
      const reordered = await makeReorderTask(ctx)(OWNER, { taskId: b.id, afterTaskId: b.id });
      expect(moved).toMatchObject({ id: a.id, stageId: k.todoId, position: a.position });
      expect(reordered).toMatchObject({ id: b.id, position: b.position });
      expect(JSON.stringify([...ctx.store.tasks])).toBe(before);
      await expect(makeMoveTask(ctx)(OWNER, { taskId: a.id, toStageId: k.doneId, afterTaskId: a.id })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(makeReorderTask(ctx)(STRANGER, { taskId: a.id, afterTaskId: a.id })).rejects.toBeInstanceOf(NotFoundError);
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

  describe("moveTask toEnd", () => {
    it("lands after every task of the destination, however many there are", { timeout: 30_000 }, async () => {
      // More tasks than any page the UI loads: the end must be resolved on the server, not from a partial list.
      const keys = generatePositions(1205);
      for (const [i, position] of keys.entries()) {
        const id = `22222222-0000-4000-8000-${(i + 1).toString(16).padStart(12, "0")}`;
        await ctx.repos.tasks.insert(buildTask({ id, title: `F${i}`, position, stageId: k.doneId, pipelineId: k.pipelineId, boardId: k.boardId }));
      }
      const t = await add("T");
      await makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.doneId, toEnd: true });
      const column = await ctx.repos.tasks.listByStage(k.doneId);
      expect(column).toHaveLength(1206);
      expect(column.at(-1)?.id).toBe(t.id);
      expect(new Set(column.map((c) => c.position)).size).toBe(1206);
    });

    it("goes to the top of an empty stage and to the bottom of its own stage", async () => {
      const [a, b, c] = [await add("A"), await add("B"), await add("C")];
      await makeMoveTask(ctx)(OWNER, { taskId: a.id, toStageId: k.doneId, toEnd: true });
      expect(await order(k.doneId)).toEqual(["A"]);
      await makeMoveTask(ctx)(OWNER, { taskId: b.id, toStageId: k.todoId, toEnd: true });
      expect(await order(k.todoId)).toEqual(["C", "B"]);
      const same = await makeMoveTask(ctx)(OWNER, { taskId: b.id, toStageId: k.todoId, toEnd: true });
      expect(same).toMatchObject({ id: b.id, position: (await ctx.repos.tasks.findById(b.id))!.position });
      expect(c.stageId).toBe(k.todoId);
    });

    it("completes the task when the end of the done stage is chosen", async () => {
      const t = await add("T");
      expect((await makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.doneId, toEnd: true })).completedAt).toEqual(ctx.clock.now());
    });

    it("needs exactly one of afterTaskId and toEnd", async () => {
      const t = await add("T");
      for (const input of [{ toEnd: true, afterTaskId: null }, {}]) {
        await expect(makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: k.doneId, ...input })).rejects.toBeInstanceOf(ValidationError);
      }
    });

    it("keeps the destination rules: foreign stage, other pipeline and viewers are refused", async () => {
      const t = await add("T");
      const sibling = await makeCreatePipeline(ctx)(OWNER, { boardId: k.boardId, name: "P2" });
      const siblingStage = await makeCreateStage(ctx)(OWNER, { pipelineId: sibling.id, name: "S" });
      await expect(makeMoveTask(ctx)(OWNER, { taskId: t.id, toStageId: siblingStage.id, toEnd: true })).rejects.toBeInstanceOf(NotFoundError);
      await expect(makeMoveTask(ctx)(GUEST, { taskId: t.id, toStageId: k.doneId, toEnd: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(makeMoveTask(ctx)(STRANGER, { taskId: t.id, toStageId: k.doneId, toEnd: true })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("position integrity", () => {
    it("keeps order and short keys over 1000 inserts into the same gap", { timeout: 30_000 }, async () => {
      const [a, b] = [await add("A"), await add("B")];
      const keys = generatePositions(1000);
      const movers = keys.map((position, i) =>
        buildTask({ id: `11111111-0000-4000-8000-${(i + 1).toString(16).padStart(12, "0")}`, title: `N${i}`, position, stageId: k.doneId, pipelineId: k.pipelineId, boardId: k.boardId }),
      );
      for (const mover of movers) await ctx.repos.tasks.insert(mover);
      for (const mover of movers) {
        await makeMoveTask(ctx)(OWNER, { taskId: mover.id, toStageId: k.todoId, afterTaskId: a.id });
      }
      const tasks = await ctx.repos.tasks.listByStage(k.todoId);
      expect(tasks).toHaveLength(1002);
      expect(tasks[0]?.id).toBe(a.id);
      expect(tasks.at(-1)?.id).toBe(b.id);
      expect(tasks.slice(1, 4).map((t) => t.title)).toEqual(["N999", "N998", "N997"]);
      expect(new Set(tasks.map((t) => t.position)).size).toBe(1002);
      expect(Math.max(...tasks.map((t) => t.position.length))).toBeLessThanOrEqual(MAX_POSITION_LENGTH);
    });

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
        await ctx.repos.tasks.insert(buildTask({ ...base, position: "a0" }));
      }
      const moving = await add("M", k.doneId);
      await makeMoveTask(ctx)(OWNER, { taskId: moving.id, toStageId: k.todoId, afterTaskId: ids.a });
      expect((await ctx.repos.tasks.listByStage(k.todoId)).map((t) => t.title)).toEqual(["a", "M", "b"]);
      const positions = (await ctx.repos.tasks.listByStage(k.todoId)).map((t) => t.position);
      expect(new Set(positions).size).toBe(3);
    });
  });
});
