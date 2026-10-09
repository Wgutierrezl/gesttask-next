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
    const now = deps.clock.now();
    const { pipelineId } = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      // Lock order: the whole stage list first (by id), the target is picked from it; then task columns by stage id.
      const stages = await tx.stages.listByPipeline(pipelineId);
      const current = stages.find((s) => s.id === stageId);
      if (!current) throw new NotFoundError();
      if (current.isDone === isDone) return current;
      const previous = isDone ? stages.filter((s) => s.isDone && s.id !== current.id) : [];
      for (const stage of previous) await tx.stages.update({ ...stage, isDone: false });
      const updated = { ...current, isDone };
      await tx.stages.update(updated);
      const changed = [...previous.map((s) => ({ id: s.id, done: false })), { id: current.id, done: isDone }];
      for (const { id, done } of changed.sort((a, b) => (a.id < b.id ? -1 : 1))) {
        await recomputeCompletion(tx, id, done, now);
      }
      return updated;
    });
  };
}
