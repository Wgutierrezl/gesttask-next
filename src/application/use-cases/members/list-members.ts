import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { listByBoardSchema } from "../../schemas/board";
import { pageWindow } from "../../schemas/common";
import { parseInput } from "../../schemas/parse";

export function makeListMembers(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<BoardMember[]> => {
    const { boardId, ...page } = parseInput(listByBoardSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    return deps.repos.members.listByBoard(boardId, pageWindow(page));
  };
}
