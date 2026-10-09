import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";
import { generateKeyBetween } from "@/domain/value-objects/position";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { deleteStageSchema } from "../../schemas/stage";
import { resolveCompletedAt } from "@/domain/entities/task";

/**
 * A stage with tasks is only deleted when a destination in the same pipeline receives them (REQ-PIP-02).
 * Moved tasks follow the destination: completed in the done stage, reopened anywhere else (REQ-TSK-05).
 */
export function makeDeleteStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { stageId, moveToStageId } = parseInput(deleteStageSchema, input);
    const stage = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    if (moveToStageId === stageId) throw new ValidationError("Destination must be a different stage");
    const now = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const tasks = await tx.tasks.listByStage(stageId);
      if (tasks.length > 0) {
        if (!moveToStageId) throw new ConflictError("Stage has tasks: choose a destination stage");
        const destination = await tx.stages.findById(moveToStageId);
        if (!destination || destination.pipelineId !== stage.pipelineId) throw new NotFoundError();
        let last = (await tx.tasks.listByStage(moveToStageId)).at(-1)?.position ?? null;
        for (const task of tasks) {
          last = generateKeyBetween(last, null);
          await tx.tasks.update({
            ...task,
            stageId: moveToStageId,
            position: last,
            completedAt: resolveCompletedAt(task.completedAt, destination.isDone, now),
          });
        }
      }
      await tx.stages.delete(stageId);
    });
  };
}
