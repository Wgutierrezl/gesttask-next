import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { positionAfter } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { reorderStageSchema } from "../../schemas/stage";
import { syncCompletion } from "./_stage-rules";

export function makeReorderStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, afterStageId } = parseInput(reorderStageSchema, input);
    const stage = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      const siblings = (await tx.stages.listByPipeline(stage.pipelineId)).filter((s) => s.id !== stage.id);
      const moved = { ...stage, position: positionAfter(siblings, afterStageId) };
      await tx.stages.update(moved);
      await syncCompletion(tx, stage.pipelineId, deps.clock.now());
      return moved;
    });
  };
}
