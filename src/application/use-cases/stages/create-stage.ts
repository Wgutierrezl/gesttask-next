import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAtEnd } from "../../placement";
import { loadPipeline } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createStageSchema } from "../../schemas/stage";
import { recomputeCompletion } from "./_completion";

/** `isDone` flags the new stage in the same transaction, moving the flag off the pipeline's previous done stage. */
export function makeCreateStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { pipelineId, name, isDone } = parseInput(createStageSchema, input);
    const pipeline = await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    const now = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const siblings = await tx.stages.listByPipeline(pipelineId);
      const placement = placeAtEnd(siblings);
      for (const relocated of placement.relocated) await tx.stages.update(relocated);
      const stage: Stage = {
        id: deps.ids.next(),
        pipelineId,
        boardId: pipeline.boardId,
        name,
        isDone,
        position: placement.position,
      };
      // At most one done stage per pipeline: the previous flag goes before the new stage claims it.
      if (isDone) {
        // Rebalanced siblings carry their new position, so clear the flag on those copies.
        const fresh = new Map(placement.relocated.map((s) => [s.id, s]));
        for (const previous of siblings.map((s) => fresh.get(s.id) ?? s).filter((s) => s.isDone)) {
          await tx.stages.update({ ...previous, isDone: false });
          await recomputeCompletion(tx, previous.id, false, now);
        }
      }
      await tx.stages.insert(stage);
      return stage;
    });
  };
}
