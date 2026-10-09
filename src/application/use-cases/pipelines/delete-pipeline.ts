import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { pipelineIdSchema } from "../../schemas/pipeline";
import { loadPipeline } from "../../resources";

/** Stages and tasks are removed with the pipeline in a single transaction (REQ-PIP-03). */
export function makeDeletePipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { pipelineId } = parseInput(pipelineIdSchema, input);
    await loadPipeline(deps.repos, actor, pipelineId, "pipeline:manage");
    await deps.uow.run((tx) => tx.pipelines.delete(pipelineId));
  };
}
