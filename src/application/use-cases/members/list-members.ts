import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

export function makeListMembers(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<BoardMember[]> => {
    const { boardId } = parseInput(boardIdSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    return deps.repos.members.listByBoard(boardId);
  };
}
