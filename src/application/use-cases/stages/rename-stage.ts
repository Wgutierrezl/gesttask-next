import { NotFoundError } from "@/domain/errors";
import type { Stage } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadStage } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { renameStageSchema } from "../../schemas/stage";

/** Name uniqueness is the repository's unique key, so a racing rename surfaces as ConflictError. */
export function makeRenameStage(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Stage> => {
    const { stageId, name } = parseInput(renameStageSchema, input);
    await loadStage(deps.repos, actor, stageId, "pipeline:manage");
    return deps.uow.run(async (tx) => {
      const current = await tx.stages.findById(stageId);
      if (!current) throw new NotFoundError();
      const renamed = { ...current, name };
      await tx.stages.update(renamed);
      return renamed;
    });
  };
}
