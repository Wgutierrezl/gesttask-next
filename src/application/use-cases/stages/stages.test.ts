import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, buildTask, seedBoard } from "@tests/support/fixtures";
import { makeCreateBoard } from "../boards/create-board";
import { makeCreatePipeline } from "../pipelines/create-pipeline";
import { makeCreateStage } from "./create-stage";
import { makeDeleteStage } from "./delete-stage";
import { makeListStages } from "./list-stages";
import { makeRenameStage } from "./rename-stage";
import { makeReorderStage } from "./reorder-stage";

describe("stages", () => {
  let ctx: TestContext;
  let boardId: string;
  let pipelineId: string;
  const names = async () => (await makeListStages(ctx)(OWNER, { pipelineId })).map((s) => s.name);
  const addStage = (name: string) => makeCreateStage(ctx)(OWNER, { pipelineId, name });

  beforeEach(async () => {
    ctx = createTestContext();
    ({ boardId } = await seedBoard(ctx));
    pipelineId = (await makeCreatePipeline(ctx)(OWNER, { boardId, name: "P" })).id;
  });

  it("appends stages in creation order with strictly increasing positions", async () => {
    const [a, b, c] = [await addStage("Todo"), await addStage("Doing"), await addStage("Done")];
    expect(a!.boardId).toBe(boardId);
    expect(a!.position < b!.position && b!.position < c!.position).toBe(true);
    expect(await names()).toEqual(["Todo", "Doing", "Done"]);
  });

  it("keeps stage names unique within a pipeline, ignoring case (REQ-PIP-01)", async () => {
    await addStage("Todo");
    await expect(addStage("todo")).rejects.toBeInstanceOf(ConflictError);
    await expect(addStage("  ")).rejects.toBeInstanceOf(ValidationError);
    expect(await names()).toEqual(["Todo"]);
  });

  it("renames a stage, allowing its own name but not a sibling's", async () => {
    const todo = await addStage("Todo");
    await addStage("Doing");
    expect((await makeRenameStage(ctx)(OWNER, { stageId: todo.id, name: "TODO" })).name).toBe("TODO");
    await expect(makeRenameStage(ctx)(OWNER, { stageId: todo.id, name: "doing" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("reorders to the top, the middle and the end", async () => {
    const [a, b, c] = [await addStage("A"), await addStage("B"), await addStage("C")];
    await makeReorderStage(ctx)(OWNER, { stageId: c!.id, afterStageId: null });
    expect(await names()).toEqual(["C", "A", "B"]);
    await makeReorderStage(ctx)(OWNER, { stageId: c!.id, afterStageId: a!.id });
    expect(await names()).toEqual(["A", "C", "B"]);
    await makeReorderStage(ctx)(OWNER, { stageId: a!.id, afterStageId: b!.id });
    expect(await names()).toEqual(["C", "B", "A"]);
  });

  it("treats dropping a stage on itself as a no-op", async () => {
    const [a, b] = [await addStage("A"), await addStage("B")];
    const before = JSON.stringify([...ctx.store.stages]);
    expect(await makeReorderStage(ctx)(OWNER, { stageId: a.id, afterStageId: a.id })).toEqual(a);
    expect(await makeReorderStage(ctx)(OWNER, { stageId: b.id, afterStageId: b.id })).toEqual(b);
    expect(JSON.stringify([...ctx.store.stages])).toBe(before);
    await expect(makeReorderStage(ctx)(STRANGER, { stageId: a.id, afterStageId: a.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects reordering relative to an unknown stage", async () => {
    const a = await addStage("A");
    const ghost = "00000000-0000-4000-8000-0000000000ff";
    await expect(makeReorderStage(ctx)(OWNER, { stageId: a.id, afterStageId: ghost })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it.each([
    ["member", MEMBER, ForbiddenError],
    ["guest", GUEST, ForbiddenError],
    ["stranger", STRANGER, NotFoundError],
  ] as const)("denies %s any stage mutation, but allows reading for members only", async (_l, who, error) => {
    const stage = await addStage("Todo");
    await expect(makeCreateStage(ctx)(who, { pipelineId, name: "X" })).rejects.toBeInstanceOf(error);
    await expect(makeRenameStage(ctx)(who, { stageId: stage.id, name: "X" })).rejects.toBeInstanceOf(error);
    await expect(makeReorderStage(ctx)(who, { stageId: stage.id, afterStageId: null })).rejects.toBeInstanceOf(error);
    await expect(makeDeleteStage(ctx)(who, { stageId: stage.id })).rejects.toBeInstanceOf(error);
    expect(await names()).toEqual(["Todo"]);
    if (who === STRANGER) await expect(makeListStages(ctx)(who, { pipelineId })).rejects.toBeInstanceOf(NotFoundError);
    else expect(await makeListStages(ctx)(who, { pipelineId })).toHaveLength(1);
  });

  describe("delete (REQ-PIP-02)", () => {
    const seedTasks = async (stageId: string, ids: string[]) => {
      for (const [i, id] of ids.entries()) {
        await ctx.repos.tasks.insert(buildTask({ id, stageId, pipelineId, boardId, position: `a${i}` }));
      }
    };

    it("deletes an empty stage", async () => {
      const stage = await addStage("Todo");
      await makeDeleteStage(ctx)(OWNER, { stageId: stage.id });
      expect(await names()).toEqual([]);
    });

    it("answers 409 and leaves tasks intact when the stage has tasks and no destination", async () => {
      const stage = await addStage("Todo");
      await seedTasks(stage.id, ["t1", "t2", "t3"]);
      await expect(makeDeleteStage(ctx)(OWNER, { stageId: stage.id })).rejects.toBeInstanceOf(ConflictError);
      expect(ctx.store.tasks.size).toBe(3);
      expect(await names()).toEqual(["Todo"]);
    });

    it("moves tasks to the end of the destination, keeping their order", async () => {
      const [todo, doing] = [await addStage("Todo"), await addStage("Doing")];
      await seedTasks(doing!.id, ["d1"]);
      await seedTasks(todo!.id, ["t1", "t2"]);
      await makeDeleteStage(ctx)(OWNER, { stageId: todo!.id, moveToStageId: doing!.id });
      expect((await ctx.repos.tasks.listByStage(doing!.id)).map((t) => t.id)).toEqual(["d1", "t1", "t2"]);
      expect(await names()).toEqual(["Doing"]);
    });

    it("rejects a destination in another pipeline or board with NotFound and changes nothing", async () => {
      const stage = await addStage("Todo");
      await seedTasks(stage.id, ["t1"]);
      const other = await makeCreateBoard(ctx)(STRANGER, { name: "Other" });
      const otherPipeline = await makeCreatePipeline(ctx)(STRANGER, { boardId: other.id, name: "P" });
      const foreign = await makeCreateStage(ctx)(STRANGER, { pipelineId: otherPipeline.id, name: "Foreign" });
      const ghost = "00000000-0000-4000-8000-0000000000ff";
      for (const moveToStageId of [foreign.id, ghost]) {
        await expect(makeDeleteStage(ctx)(OWNER, { stageId: stage.id, moveToStageId })).rejects.toBeInstanceOf(
          NotFoundError,
        );
      }
      expect(ctx.store.tasks.get("t1")?.stageId).toBe(stage.id);
    });

    it("rejects using the stage itself as destination", async () => {
      const stage = await addStage("Todo");
      await expect(makeDeleteStage(ctx)(OWNER, { stageId: stage.id, moveToStageId: stage.id })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  describe("completion follows the final stage (REQ-TSK-05)", () => {
    it("completes tasks of the new final stage and reopens those of the former one", async () => {
      const [todo, done] = [await addStage("Todo"), await addStage("Done")];
      const stamp = new Date("2026-10-02T00:00:00.000Z");
      await ctx.repos.tasks.insert(buildTask({ id: "t1", stageId: done!.id, pipelineId, boardId, completedAt: stamp }));
      await ctx.repos.tasks.insert(buildTask({ id: "t2", stageId: todo!.id, pipelineId, boardId }));
      await makeReorderStage(ctx)(OWNER, { stageId: todo!.id, afterStageId: done!.id });
      expect(ctx.store.tasks.get("t1")?.completedAt).toBeNull();
      expect(ctx.store.tasks.get("t2")?.completedAt).toEqual(ctx.clock.now());
    });

    it("reopens tasks of the previous final stage when a new stage is appended", async () => {
      const done = await addStage("Done");
      const stamp = new Date("2026-10-02T00:00:00.000Z");
      await ctx.repos.tasks.insert(buildTask({ id: "t1", stageId: done.id, pipelineId, boardId, completedAt: stamp }));
      await addStage("Archive");
      expect(ctx.store.tasks.get("t1")?.completedAt).toBeNull();
    });

    it("keeps the original stamp of tasks that stay in the final stage", async () => {
      const [todo, done] = [await addStage("Todo"), await addStage("Done")];
      const stamp = new Date("2026-10-02T00:00:00.000Z");
      await ctx.repos.tasks.insert(buildTask({ id: "t1", stageId: done!.id, pipelineId, boardId, completedAt: stamp }));
      await makeDeleteStage(ctx)(OWNER, { stageId: todo!.id });
      expect(ctx.store.tasks.get("t1")?.completedAt).toEqual(stamp);
    });
  });
});
