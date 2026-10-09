import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAtEnd } from "../../placement";
import { loadPipeline } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createStageSchema } from "../../schemas/stage";

export function makeCreateStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { pipelineId, name } = parseInput(createStageSchema, input);
    const pipeline = await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      const siblings = await tx.stages.listByPipeline(pipelineId);
      const placement = placeAtEnd(siblings);
      for (const relocated of placement.relocated) await tx.stages.update(relocated);
      const stage: Stage = {
        id: deps.ids.next(),
        pipelineId,
        boardId: pipeline.boardId,
        name,
        isDone: false,
        position: placement.position,
      };
      await tx.stages.insert(stage);
      return stage;
    });
  };
}
