import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadPipeline } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { listStagesSchema } from "../../schemas/pipeline";

export function makeListStages(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage[]> => {
    const { pipelineId, ...page } = parseInput(listStagesSchema, input);
    await loadPipeline(deps.repos, actor, pipelineId, "board:view");
    return deps.repos.stages.listByPipeline(pipelineId, page);
  };
}
