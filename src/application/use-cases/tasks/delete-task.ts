import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { taskIdSchema } from "../../schemas/task";

export function makeDeleteTask(deps: AppDeps) {
  /** Returns where the task lived, so the caller can go back there without trusting ids sent by the client. */
  return async (actor: Actor, input: unknown): Promise<{ boardId: string; pipelineId: string }> => {
    const { taskId } = parseInput(taskIdSchema, input);
    const { boardId, pipelineId } = await loadTask(deps.repos, actor, taskId, "task:write");
    await deps.uow.run((tx) => tx.tasks.delete(taskId));
    return { boardId, pipelineId };
  };
}
