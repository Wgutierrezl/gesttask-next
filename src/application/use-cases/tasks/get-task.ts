import { withOverdue, type TaskView } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { taskIdSchema } from "../../schemas/task";

export function makeGetTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<TaskView> => {
    const { taskId } = parseInput(taskIdSchema, input);
    return withOverdue(await loadTask(deps.repos, actor, taskId, "board:view"), deps.clock.now());
  };
}
