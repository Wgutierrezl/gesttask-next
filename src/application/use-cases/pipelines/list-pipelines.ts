import type { Pipeline } from "@/domain/entities/pipeline";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

export function makeListPipelines(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Pipeline[]> => {
    const { boardId } = parseInput(boardIdSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    return deps.repos.pipelines.listByBoard(boardId);
  };
}
