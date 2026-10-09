import { NotFoundError } from "@/domain/errors";
import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { placeAfter } from "../../placement";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { reorderStageSchema } from "../../schemas/stage";

export function makeReorderStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, afterStageId } = parseInput(reorderStageSchema, input);
    const stage = await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    if (afterStageId === stage.id) return stage;
    return deps.uow.run(async (tx) => {
      // Lock the list first and pick the target from it (global lock order).
      const stages = await tx.stages.listByPipeline(stage.pipelineId);
      const current = stages.find((s) => s.id === stageId);
      if (!current) throw new NotFoundError();
      const siblings = stages.filter((s) => s.id !== current.id);
      const placement = placeAfter(siblings, afterStageId);
      for (const relocated of placement.relocated) await tx.stages.update(relocated);
      const moved = { ...current, position: placement.position };
      await tx.stages.update(moved);
      return moved;
    });
  };
}
