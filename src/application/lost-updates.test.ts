import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/domain/errors";
import { withInterleavedWrite } from "@tests/support/race";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { OWNER, seedKanban } from "@tests/support/fixtures";
import { makeCreateBoard } from "./use-cases/boards/create-board";
import { makeUpdateBoard } from "./use-cases/boards/update-board";
import { makeCreatePipeline } from "./use-cases/pipelines/create-pipeline";
import { makeUpdatePipeline } from "./use-cases/pipelines/update-pipeline";
import { makeRenameStage } from "./use-cases/stages/rename-stage";
import { makeReorderStage } from "./use-cases/stages/reorder-stage";
import { makeSetStageDone } from "./use-cases/stages/set-stage-done";
import { makeCreateTask } from "./use-cases/tasks/create-task";
import { makeMoveTask } from "./use-cases/tasks/move-task";
import { makeReorderTask } from "./use-cases/tasks/reorder-task";
import { makeUpdateTask } from "./use-cases/tasks/update-task";

describe("read-modify-write happens inside the transaction", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  let taskId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
    taskId = (await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "T" })).id;
  });

  const edit = (id: string, patch: object) => (store: TestContext["store"]) =>
    void Object.assign(store.tasks.get(id) as object, patch);

  it("updateTask keeps a concurrent change to a field it does not touch", async () => {
    const racing = withInterleavedWrite(ctx, edit(taskId, { priority: "high", description: "edited elsewhere" }));
    await makeUpdateTask(racing)(OWNER, { taskId, title: "Renamed" });
    expect(await ctx.repos.tasks.findById(taskId)).toMatchObject({
      title: "Renamed",
      priority: "high",
      description: "edited elsewhere",
    });
  });

  it("updateTask answers NotFound when the task vanished before the transaction", async () => {
    const racing = withInterleavedWrite(ctx, (store) => void store.tasks.delete(taskId));
    await expect(makeUpdateTask(racing)(OWNER, { taskId, title: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([
    ["move", (c: TestContext) => makeMoveTask(c)(OWNER, { taskId, toStageId: k.doneId, afterTaskId: null })],
    ["reorder", (c: TestContext) => makeReorderTask(c)(OWNER, { taskId, afterTaskId: null })],
  ])("%s keeps a concurrent change to the task's other fields", async (_label, run) => {
    await run(withInterleavedWrite(ctx, edit(taskId, { title: "edited elsewhere", assigneeId: "member" })));
    expect(await ctx.repos.tasks.findById(taskId)).toMatchObject({ title: "edited elsewhere", assigneeId: "member" });
  });

  it("move answers NotFound when the task vanished before the transaction", async () => {
    const racing = withInterleavedWrite(ctx, (store) => void store.tasks.delete(taskId));
    await expect(
      makeMoveTask(racing)(OWNER, { taskId, toStageId: k.doneId, afterTaskId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("renameStage and reorderStage keep each other's concurrent changes", async () => {
    const renamedElsewhere = withInterleavedWrite(ctx, (store) => void Object.assign(store.stages.get(k.todoId)!, { name: "Backlog" }));
    await makeReorderStage(renamedElsewhere)(OWNER, { stageId: k.todoId, afterStageId: k.doneId });
    expect(await ctx.repos.stages.findById(k.todoId)).toMatchObject({ name: "Backlog" });

    const movedElsewhere = withInterleavedWrite(ctx, (store) => void Object.assign(store.stages.get(k.doneId)!, { position: "a9" }));
    await makeRenameStage(movedElsewhere)(OWNER, { stageId: k.doneId, name: "Shipped" });
    expect(await ctx.repos.stages.findById(k.doneId)).toMatchObject({ name: "Shipped", position: "a9" });
  });

  it("stage mutations answer NotFound when the stage vanished before the transaction", async () => {
    const gone = (c: TestContext) => withInterleavedWrite(c, (store) => void store.stages.delete(k.doneId));
    await expect(makeRenameStage(gone(ctx))(OWNER, { stageId: k.doneId, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    ctx.store.stages.set(k.doneId, { id: k.doneId, pipelineId: k.pipelineId, boardId: k.boardId, name: "Done", isDone: true, position: "a1" });
    await expect(
      makeReorderStage(gone(ctx))(OWNER, { stageId: k.doneId, afterStageId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    ctx.store.stages.set(k.doneId, { id: k.doneId, pipelineId: k.pipelineId, boardId: k.boardId, name: "Done", isDone: true, position: "a1" });
    await expect(makeSetStageDone(gone(ctx))(OWNER, { stageId: k.doneId, isDone: false })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updateBoard and updatePipeline keep concurrent changes to other fields", async () => {
    const racingBoard = withInterleavedWrite(ctx, (store) => void Object.assign(store.boards.get(k.boardId)!, { description: "elsewhere" }));
    await makeUpdateBoard(racingBoard)(OWNER, { boardId: k.boardId, name: "Renamed" });
    expect(await ctx.repos.boards.findById(k.boardId)).toMatchObject({ name: "Renamed", description: "elsewhere" });

    const racingPipeline = withInterleavedWrite(ctx, (store) => void Object.assign(store.pipelines.get(k.pipelineId)!, { description: "elsewhere" }));
    await makeUpdatePipeline(racingPipeline)(OWNER, { pipelineId: k.pipelineId, name: "Renamed" });
    expect(await ctx.repos.pipelines.findById(k.pipelineId)).toMatchObject({ name: "Renamed", description: "elsewhere" });
  });

  it("updateBoard and updatePipeline answer NotFound when the row vanished before the transaction", async () => {
    const board = await makeCreateBoard(ctx)(OWNER, { name: "Temp" });
    const pipeline = await makeCreatePipeline(ctx)(OWNER, { boardId: board.id, name: "Temp" });
    const racing = withInterleavedWrite(ctx, (store) => void store.pipelines.delete(pipeline.id));
    await expect(makeUpdatePipeline(racing)(OWNER, { pipelineId: pipeline.id, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    const racingBoard = withInterleavedWrite(ctx, (store) => void store.boards.delete(board.id));
    await expect(makeUpdateBoard(racingBoard)(OWNER, { boardId: board.id, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
