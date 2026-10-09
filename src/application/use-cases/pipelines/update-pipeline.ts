import type { Pipeline } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { updatePipelineSchema } from "../../schemas/pipeline";
import { loadPipeline } from "../../resources";

export function makeUpdatePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline> => {
    const { pipelineId, ...changes } = parseInput(updatePipelineSchema, input);
    const current = await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    const updated: Pipeline = {
      ...current,
      name: changes.name ?? current.name,
      description: changes.description ?? current.description,
    };
    await deps.repos.pipelines.update(updated);
    return updated;
  };
}
