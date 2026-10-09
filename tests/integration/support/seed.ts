import type { AppDeps } from "@/application/deps";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { makeCreatePipeline } from "@/application/use-cases/pipelines/create-pipeline";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { actor } from "@tests/support/fixtures";

export const OWNER = actor("owner");

/** A board owned by `owner` with one pipeline (To do / In progress / Done) built through the real use cases. */
export async function seedKanban(deps: AppDeps, owner = OWNER) {
  const board = await makeCreateBoard(deps)(owner, { name: "Race" });
  const pipeline = await makeCreatePipeline(deps)(owner, { boardId: board.id, name: "Flow" });
  const stages = await deps.repos.stages.listByPipeline(pipeline.id);
  const [todo, doing, done] = stages as [(typeof stages)[0], (typeof stages)[0], (typeof stages)[0]];
  return { boardId: board.id, pipelineId: pipeline.id, todo, doing, done };
}

export async function addTask(deps: AppDeps, stageId: string, extra: Record<string, unknown> = {}) {
  return makeCreateTask(deps)(OWNER, { stageId, title: "Task", ...extra });
}
