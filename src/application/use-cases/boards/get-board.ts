import { NotFoundError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import type { BoardRole } from "@/domain/value-objects/board-role";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

/** The board plus the caller's own role, so the UI can show only the controls the policy would allow. */
export function makeGetBoard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<{ board: Board; role: BoardRole }> => {
    const { boardId } = parseInput(boardIdSchema, input);
    const role = await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    const board = await deps.repos.boards.findById(boardId);
    if (!board) throw new NotFoundError();
    return { board, role };
  };
}
