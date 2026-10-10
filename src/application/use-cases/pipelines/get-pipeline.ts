import { NotFoundError } from "@/domain/errors";
import type { Pipeline } from "@/domain/entities/pipeline";
import type { BoardRole } from "@/domain/value-objects/board-role";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { pipelineIdSchema } from "../../schemas/pipeline";

/**
 * The pipeline plus the caller's role on its board, so the Kanban page can show only the controls the policy
 * allows. The role is read after the membership check; a foreign or unknown id is the same NotFound.
 */
export function makeGetPipeline(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<{ pipeline: Pipeline; role: BoardRole }> => {
    const { pipelineId } = parseInput(pipelineIdSchema, input);
    const pipeline = await deps.repos.pipelines.findById(pipelineId);
    if (!pipeline) throw new NotFoundError();
    const role = await requireBoardAccess(deps.repos.members, actor, pipeline.boardId, "board:view");
    return { pipeline, role };
  };
}
