import type { Pipeline } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { createPipelineSchema } from "../../schemas/pipeline";

export function makeCreatePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline> => {
    const data = parseInput(createPipelineSchema, input);
    await requireBoardAccess(deps.repos.members, actor, data.boardId, "pipeline:manage");
    const pipeline: Pipeline = { id: deps.ids.next(), ...data };
    await deps.repos.pipelines.insert(pipeline);
    return pipeline;
  };
}
