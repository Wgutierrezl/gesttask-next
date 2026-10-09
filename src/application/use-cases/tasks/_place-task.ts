import { NotFoundError, ValidationError } from "@/domain/errors";
import { isTerminalStage } from "@/domain/entities/pipeline";
import { resolveCompletedAt, withOverdue, type Task, type TaskView } from "@/domain/entities/task";
import { generatePositions } from "@/domain/value-objects/position";
import type { AppDeps } from "../../deps";
import { positionAfter } from "../../placement";

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
  const now = deps.clock.now();
  const placed = await deps.uow.run(async (tx) => {
    const stages = await tx.stages.listByPipeline(task.pipelineId);
    if (!stages.some((s) => s.id === toStageId)) throw new NotFoundError();
    const others = (await tx.tasks.listByStage(toStageId)).filter((t) => t.id !== task.id);
    let position: string;
    try {
      position = positionAfter(others, afterTaskId);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      // Neighbours collided (e.g. concurrent writers): rebalance the column, then retry once.
      const keys = generatePositions(others.length);
      for (const [i, other] of others.entries()) other.position = keys[i] as string;
      for (const other of others) await tx.tasks.update(other);
      position = positionAfter(others, afterTaskId);
    }
    const moved: Task = {
      ...task,
      stageId: toStageId,
      position,
      completedAt: resolveCompletedAt(task.completedAt, isTerminalStage(toStageId, stages), now),
    };
    await tx.tasks.update(moved);
    return moved;
  });
  return withOverdue(placed, now);
}
