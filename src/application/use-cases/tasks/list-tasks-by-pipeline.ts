import { withOverdue, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadPipeline } from "../../resources";
import { pageWindow } from "../../schemas/common";
import { parseInput } from "../../schemas/parse";
import { listTasksByPipelineSchema } from "../../schemas/task";

/** Paginated (default 50, max 200); an empty pipeline yields `[]`. */
export function makeListTasksByPipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView[]> => {
    const { pipelineId, ...page } = parseInput(listTasksByPipelineSchema, input);
    await loadPipeline(deps.repos, actor, pipelineId, "board:view");
    const tasks = await deps.repos.tasks.listByPipeline(pipelineId, pageWindow(page));
    const now = deps.clock.now();
    return tasks.map((task) => withOverdue(task, now));
  };
}
