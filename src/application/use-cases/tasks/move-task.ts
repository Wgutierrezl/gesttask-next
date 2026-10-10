import type { TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { moveTaskSchema } from "../../schemas/task";
import { placeTask } from "./_place-task";

/** Moving inside the current stage is a plain reorder (REQ-TSK-03). `toEnd` puts the task last in the destination. */
export function makeMoveTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const { taskId, toStageId, afterTaskId, toEnd } = parseInput(moveTaskSchema, input);
    await loadTask(deps.repos, actor, taskId, "task:write");
    return placeTask(deps, taskId, toStageId, toEnd ? "end" : (afterTaskId ?? null));
  };
}
