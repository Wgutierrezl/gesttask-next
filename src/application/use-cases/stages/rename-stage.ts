import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { renameStageSchema } from "../../schemas/stage";
import { assertNameAvailable } from "./_stage-rules";

export function makeRenameStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, name } = parseInput(renameStageSchema, input);
    const stage = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    assertNameAvailable(await deps.repos.stages.listByPipeline(stage.pipelineId), name, stage.id);
    const renamed = { ...stage, name };
    await deps.repos.stages.update(renamed);
    return renamed;
  };
}
