import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { taskIdSchema } from "../../schemas/task";

export function makeDeleteTask(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { taskId } = parseInput(taskIdSchema, input);
    await loadTask(deps.repos, actor, taskId, "task:write");
    await deps.uow.run((tx) => tx.tasks.delete(taskId));
  };
}
