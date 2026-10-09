import { NotFoundError } from "@/domain/errors";
import type { Stage } from "@/domain/entities/pipeline";
import { resolveCompletedAt } from "@/domain/entities/task";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import type { Repos } from "../../ports/repositories";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { setStageDoneSchema } from "../../schemas/stage";

async function recomputeCompletion(tx: Repos, stageId: string, inDoneStage: boolean, now: Date): Promise<void> {
  for (const task of await tx.tasks.listByStage(stageId)) {
    const completedAt = resolveCompletedAt(task.completedAt, inDoneStage, now);
    if (completedAt?.getTime() !== task.completedAt?.getTime()) await tx.tasks.update({ ...task, completedAt });
  }
}

/**
 * Flags (or unflags) the stage whose tasks count as completed (REQ-TSK-05). Flagging a stage clears
 * the pipeline's previous done stage in the same transaction, and completion is recomputed only for
 * the tasks of the stages whose flag changed, so unrelated tasks are never touched.
 */
export function makeSetStageDone(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, isDone } = parseInput(setStageDoneSchema, input);
    await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    const now = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const current = await tx.stages.findById(stageId);
      if (!current) throw new NotFoundError();
      if (current.isDone === isDone) return current;
      if (isDone) {
        const siblings = await tx.stages.listByPipeline(current.pipelineId);
        for (const previous of siblings.filter((s) => s.isDone && s.id !== current.id)) {
          await tx.stages.update({ ...previous, isDone: false });
          await recomputeCompletion(tx, previous.id, false, now);
        }
      }
      const updated = { ...current, isDone };
      await tx.stages.update(updated);
      await recomputeCompletion(tx, stageId, isDone, now);
      return updated;
    });
  };
}
