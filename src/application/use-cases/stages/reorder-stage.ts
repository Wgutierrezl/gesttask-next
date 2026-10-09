import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAfter } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { reorderStageSchema } from "../../schemas/stage";
import { syncCompletion } from "./_stage-rules";

export function makeReorderStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, afterStageId } = parseInput(reorderStageSchema, input);
    const stage = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    if (afterStageId === stage.id) return stage;
    return deps.uow.run(async (tx) => {
      const siblings = (await tx.stages.listByPipeline(stage.pipelineId)).filter((s) => s.id !== stage.id);
      const placement = placeAfter(siblings, afterStageId);
      for (const relocated of placement.relocated) await tx.stages.update(relocated);
      const moved = { ...stage, position: placement.position };
      await tx.stages.update(moved);
      await syncCompletion(tx, stage.pipelineId, deps.clock.now());
      return moved;
    });
  };
}
