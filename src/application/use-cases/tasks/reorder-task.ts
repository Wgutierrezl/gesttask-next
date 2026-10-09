import type { TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { reorderTaskSchema } from "../../schemas/task";
import { placeTask } from "./_place-task";

export function makeReorderTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const { taskId, afterTaskId } = parseInput(reorderTaskSchema, input);
    await loadTask(deps.repos, actor, taskId, "task:write");
    return placeTask(deps, taskId, null, afterTaskId);
  };
}
