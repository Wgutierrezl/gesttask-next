import { ConflictError, NotFoundError } from "@/domain/errors";
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
  // Pipeline and column are read from a snapshot only to know WHAT to lock; the task itself is re-read under lock.
  const origin = await deps.repos.tasks.findById(taskId);
  if (!origin) throw new NotFoundError();
  const placed = await deps.uow.run(async (tx) => {
    // Lock order: stage list, then task columns in stage-id order; the task is picked from its column.
    const stages = await tx.stages.listByPipeline(origin.pipelineId);
    const destinationId = toStageId ?? origin.stageId;
    const destination = stages.find((s) => s.id === destinationId);
    if (!destination) throw new NotFoundError();
    const columns = new Map<string, Task[]>();
    for (const id of [...new Set([origin.stageId, destinationId])].sort()) columns.set(id, await tx.tasks.listByStage(id));
    const task = columns.get(origin.stageId)?.find((t) => t.id === taskId);
    if (!task) {
      // Gone, or moved to another column since the pre-flight read.
      if (!(await tx.tasks.findById(taskId))) throw new NotFoundError();
      throw new ConflictError("The task changed column concurrently; retry");
    }
    if (afterTaskId === task.id && destinationId === task.stageId) return task;
    const others = (columns.get(destinationId) ?? []).filter((t) => t.id !== task.id);
    const placement = placeAfter(others, afterTaskId);
    for (const relocated of placement.relocated) await tx.tasks.update(relocated);
    const moved: Task = {
      ...task,
      stageId: destinationId,
      position: placement.position,
      completedAt: resolveCompletedAt(task.completedAt, destination.isDone, now),
    };
    await tx.tasks.update(moved);
    return moved;
  });
  return withOverdue(placed, now);
}
