import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";
import { resolveCompletedAt } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAtEnd } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { enqueueAttachmentCleanup } from "../../storage-cleanup";
import { deleteStageSchema } from "../../schemas/stage";

/**
 * A stage with tasks is only deleted when a destination in the same pipeline receives them (REQ-PIP-02).
 * The done stage cannot be deleted (Jira-like): move the done flag to another stage first, so the
 * pipeline never silently loses its completion semantics. Moved tasks follow the destination
 * (completed in the done stage, reopened anywhere else, REQ-TSK-05).
 * Lock order: the stage list first (target and destination are picked from it), then the task
 * columns in stage-id order.
 */
export function makeDeleteStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { stageId, moveToStageId } = parseInput(deleteStageSchema, input);
    const snapshot = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    if (moveToStageId === stageId) throw new ValidationError("Destination must be a different stage");
    const now = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const stages = await tx.stages.listByPipeline(snapshot.pipelineId);
      const stage = stages.find((s) => s.id === stageId);
      if (!stage) throw new NotFoundError();
      if (stage.isDone) throw new ConflictError("The done stage cannot be deleted: move the done flag to another stage first");
      const destination = moveToStageId ? stages.find((s) => s.id === moveToStageId) : undefined;
      if (moveToStageId && !destination) throw new NotFoundError();
      const columns = new Map<string, Awaited<ReturnType<typeof tx.tasks.listByStage>>>();
      for (const id of [stageId, destination?.id ?? ""].filter(Boolean).sort()) {
        columns.set(id, await tx.tasks.listByStage(id));
      }
      const tasks = columns.get(stageId) ?? [];
      if (tasks.length > 0) {
        if (!destination) throw new ConflictError("Stage has tasks: choose a destination stage");
        let column = columns.get(destination.id) ?? [];
        for (const task of tasks) {
          const placement = placeAtEnd(column);
          for (const relocated of placement.relocated) await tx.tasks.update(relocated);
          const moved = {
            ...task,
            stageId: destination.id,
            position: placement.position,
            completedAt: resolveCompletedAt(task.completedAt, destination.isDone, now),
          };
          await tx.tasks.update(moved);
          const rebalanced = new Map(placement.relocated.map((r) => [r.id, r]));
          column = [...column.map((t) => rebalanced.get(t.id) ?? t), moved];
        }
      }
      // The stage is empty by now (its tasks moved), but the cascade is what deletes rows: queue whatever it would take.
      await enqueueAttachmentCleanup(tx, { stageId });
      await tx.stages.delete(stageId);
    });
  };
}
