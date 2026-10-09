import { NotFoundError } from "@/domain/errors";
import type { Pipeline } from "@/domain/entities/pipeline";
import type { BoardAction } from "@/domain/policy/board-policy";
import type { Actor } from "./actor";
import { requireBoardAccess } from "./authorize";
import type { Repos } from "./ports/repositories";

/**
 * Child resources are authorized BEFORE anything is returned: a missing id and a foreign id
 * both raise the same NotFoundError, so IDOR is impossible by construction (REQ-ISO-08).
 */
export async function loadPipeline(
  repos: Repos,
  actor: Actor,
  pipelineId: string,
  action: BoardAction,
): Promise<Pipeline> {
  const pipeline = await repos.pipelines.findById(pipelineId);
  if (!pipeline) throw new NotFoundError();
  await requireBoardAccess(repos.members, actor, pipeline.boardId, action);
  return pipeline;
}
