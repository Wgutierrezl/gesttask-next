import { ConflictError, NotFoundError } from "@/domain/errors";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import type { Stage } from "@/domain/entities/pipeline";
import type { AppDeps } from "../../deps";
import { placeAfter, placeAtEnd } from "../../placement";

/**
 * Shared by move and reorder: puts the task in `toStageId` (null = where it currently is) right
 * after `afterTaskId` (null = top). The task is re-read inside the transaction so concurrent edits
 * to its other fields survive. `"end"` as the anchor resolves the last task of the destination inside the transaction.
 * The destination may live in any pipeline of the task's own board (ADR 0019); a stage of another board is
 * indistinguishable from a missing one. Dropping a task on itself changes nothing.
 */
export async function placeTask(
  deps: AppDeps,
  taskId: string,
  toStageId: string | null,
  anchor: string | null | "end",
): Promise<TaskView> {
  // The snapshot decides what to lock; if the task left that column meanwhile (likelier now that a move can cross
  // pipelines), take a fresh snapshot once and, if it is stale again, report the concurrent move.
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await attemptPlace(deps, taskId, toStageId, anchor);
    if (outcome !== STALE) return outcome;
  }
  throw new ConflictError("The task changed column concurrently; retry", { reason: "task.movedConcurrently" });
}

const STALE = Symbol("stale-origin");

async function attemptPlace(
  deps: AppDeps,
  taskId: string,
  toStageId: string | null,
  anchor: string | null | "end",
): Promise<TaskView | typeof STALE> {
  const now = deps.clock.now();
  // Pipeline and column are read from a snapshot only to know WHAT to lock; the task itself is re-read under lock.
  const origin = await deps.repos.tasks.findById(taskId);
  if (!origin) throw new NotFoundError();
  let destinationPipelineId = origin.pipelineId;
  if (toStageId && toStageId !== origin.stageId) {
    const target = await deps.repos.stages.findById(toStageId);
    if (!target || target.boardId !== origin.boardId) throw new NotFoundError();
    destinationPipelineId = target.pipelineId;
  }
  const placed = await deps.uow.run<Task | typeof STALE>(async (tx) => {
    // Lock order: pipelines (by id) with their stage lists, then task columns in stage-id order; the task is picked from its column.
    const destinationId = toStageId ?? origin.stageId;
    let destination: Stage | undefined;
    for (const pipelineId of [...new Set([origin.pipelineId, destinationPipelineId])].sort()) {
      const found = (await tx.stages.listByPipeline(pipelineId)).find((s) => s.id === destinationId);
      if (found) destination = found;
    }
    if (!destination || destination.pipelineId !== destinationPipelineId) throw new NotFoundError();
    const columns = new Map<string, Task[]>();
    for (const id of [...new Set([origin.stageId, destinationId])].sort()) columns.set(id, await tx.tasks.listByStage(id));
    const task = columns.get(origin.stageId)?.find((t) => t.id === taskId);
    if (!task) {
      // Gone, or moved to another column since the pre-flight read.
      if (!(await tx.tasks.findById(taskId))) throw new NotFoundError();
      return STALE;
    }
    // Dropping on itself is a no-op in its own column; anchored on itself in another column it is not a neighbour there (NotFound below).
    if (anchor === task.id && destinationId === task.stageId) return task;
    const others = (columns.get(destinationId) ?? []).filter((t) => t.id !== task.id);
    // Already last where it should go: nothing to write.
    if (anchor === "end" && destinationId === task.stageId && columns.get(destinationId)?.at(-1)?.id === task.id) return task;
    const placement = anchor === "end" ? placeAtEnd(others) : placeAfter(others, anchor);
    for (const relocated of placement.relocated) await tx.tasks.update(relocated);
    const moved: Task = {
      ...task,
      pipelineId: destination.pipelineId,
      stageId: destinationId,
      position: placement.position,
      completedAt: resolveCompletedAt(task.completedAt, destination.isDone, now),
    };
    await tx.tasks.update(moved);
    return moved;
  });
  return placed === STALE ? STALE : withOverdue(placed, now);
}
