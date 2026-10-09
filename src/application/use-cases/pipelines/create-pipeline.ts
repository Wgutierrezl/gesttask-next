import { DEFAULT_STAGES, type Pipeline, type Stage } from "@/domain/entities/pipeline";
import { generatePositions } from "@/domain/value-objects/position";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { createPipelineSchema } from "../../schemas/pipeline";

/** A new pipeline starts with the default stages, the last one flagged done (REQ-TSK-05). */
export function makeCreatePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline> => {
    const data = parseInput(createPipelineSchema, input);
    await requireBoardAccess(deps.repos.members, actor, data.boardId, "pipeline:manage");
    const pipeline: Pipeline = { id: deps.ids.next(), ...data };
    const positions = generatePositions(DEFAULT_STAGES.length);
    await deps.uow.run(async (tx) => {
      await tx.pipelines.insert(pipeline);
      for (const [i, template] of DEFAULT_STAGES.entries()) {
        const stage: Stage = {
          id: deps.ids.next(),
          pipelineId: pipeline.id,
          boardId: pipeline.boardId,
          name: template.name,
          isDone: template.isDone,
          position: positions[i]!,
        };
        await tx.stages.insert(stage);
      }
    });
    return pipeline;
  };
}
