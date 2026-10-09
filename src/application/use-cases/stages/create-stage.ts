import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { positionAtEnd } from "../../placement";
import { loadPipeline } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createStageSchema } from "../../schemas/stage";
import { syncCompletion } from "./_stage-rules";

export function makeCreateStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { pipelineId, name } = parseInput(createStageSchema, input);
    const pipeline = await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      const siblings = await tx.stages.listByPipeline(pipelineId);
      const stage: Stage = {
        id: deps.ids.next(),
        pipelineId,
        boardId: pipeline.boardId,
        name,
        position: positionAtEnd(siblings),
      };
      await tx.stages.insert(stage);
      await syncCompletion(tx, pipelineId, deps.clock.now());
      return stage;
    });
  };
}
