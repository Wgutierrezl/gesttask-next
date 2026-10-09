import { NotFoundError } from "@/domain/errors";
import type { Pipeline } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { updatePipelineSchema } from "../../schemas/pipeline";
import { loadPipeline } from "../../resources";

export function makeUpdatePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline> => {
    const { pipelineId, ...changes } = parseInput(updatePipelineSchema, input);
    await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      const current = await tx.pipelines.findById(pipelineId);
      if (!current) throw new NotFoundError();
      const updated: Pipeline = {
        ...current,
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
      };
      await tx.pipelines.update(updated);
      return updated;
    });
  };
}
