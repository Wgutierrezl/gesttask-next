import { NotFoundError } from "@/domain/errors";
import { isTerminalStage } from "@/domain/entities/pipeline";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { AppDeps } from "../../deps";
import { placeAfter } from "../../placement";

/**
 * Shared by move and reorder: puts the task in `toStageId` (null = where it currently is) right
 * after `afterTaskId` (null = top). The task is re-read inside the transaction so concurrent edits
 * to its other fields survive. The destination must live in the task's own pipeline, otherwise it
 * is indistinguishable from a missing one (REQ-ISO-07). Dropping a task on itself changes nothing.
 */
export async function placeTask(
  deps: AppDeps,
  taskId: string,
  toStageId: string | null,
  afterTaskId: string | null,
): Promise<TaskView> {
  const now = deps.clock.now();
  const placed = await deps.uow.run(async (tx) => {
    const task = await tx.tasks.findById(taskId);
    if (!task) throw new NotFoundError();
    const destinationId = toStageId ?? task.stageId;
    if (afterTaskId === task.id && destinationId === task.stageId) return task;
    const stages = await tx.stages.listByPipeline(task.pipelineId);
    if (!stages.some((s) => s.id === destinationId)) throw new NotFoundError();
    const others = (await tx.tasks.listByStage(destinationId)).filter((t) => t.id !== task.id);
    const placement = placeAfter(others, afterTaskId);
    for (const relocated of placement.relocated) await tx.tasks.update(relocated);
    const moved: Task = {
      ...task,
      stageId: destinationId,
      position: placement.position,
      completedAt: resolveCompletedAt(task.completedAt, isTerminalStage(destinationId, stages), now),
    };
    await tx.tasks.update(moved);
    return moved;
  });
  return withOverdue(placed, now);
}
