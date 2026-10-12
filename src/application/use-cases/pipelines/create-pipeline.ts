import { DEFAULT_STAGES, type Pipeline, type Stage } from "@/domain/entities/pipeline";
import { generatePositions } from "@/domain/value-objects/position";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { createPipelineSchema } from "../../schemas/pipeline";

/**
 * A new pipeline starts with the stages the caller names, or the defaults, the last one flagged done either way (REQ-TSK-05).
 * Names are already trimmed, non-empty and unique ignoring case (the same rule the database enforces per pipeline).
 */
export function makeCreatePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline> => {
    const data = parseInput(createPipelineSchema, input);
    await requireBoardAccess(deps.repos.members, actor, data.boardId, "pipeline:manage");
    const { stages: names, ...fields } = data;
    const pipeline: Pipeline = { id: deps.ids.next(), ...fields };
    const templates = names ? names.map((name, i) => ({ name, isDone: i === names.length - 1 })) : DEFAULT_STAGES;
    const positions = generatePositions(templates.length);
    await deps.uow.run(async (tx) => {
      await tx.pipelines.insert(pipeline);
      for (const [i, template] of templates.entries()) {
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
