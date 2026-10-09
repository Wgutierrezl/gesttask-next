import { NotFoundError } from "@/domain/errors";
import { isTerminalStage } from "@/domain/entities/pipeline";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { AppDeps } from "../../deps";
import { placeAfter } from "../../placement";

/**
 * Shared by move and reorder: puts `task` in `toStageId` right after `afterTaskId` (null = top).
 * The destination must live in the task's own pipeline, otherwise it is indistinguishable from a
 * missing one (REQ-ISO-07). Positions are derived from neighbours on the server.
 */
export async function placeTask(
  deps: AppDeps,
  task: Task,
  toStageId: string,
  afterTaskId: string | null,
): Promise<TaskView> {
  if (afterTaskId === task.id && toStageId === task.stageId) return withOverdue(task, deps.clock.now());
  const now = deps.clock.now();
  const placed = await deps.uow.run(async (tx) => {
    const stages = await tx.stages.listByPipeline(task.pipelineId);
    if (!stages.some((s) => s.id === toStageId)) throw new NotFoundError();
    const others = (await tx.tasks.listByStage(toStageId)).filter((t) => t.id !== task.id);
    const placement = placeAfter(others, afterTaskId);
    for (const relocated of placement.relocated) await tx.tasks.update(relocated);
    const moved: Task = {
      ...task,
      stageId: toStageId,
      position: placement.position,
      completedAt: resolveCompletedAt(task.completedAt, isTerminalStage(toStageId, stages), now),
    };
    await tx.tasks.update(moved);
    return moved;
  });
  return withOverdue(placed, now);
}
