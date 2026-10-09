import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

/** Owner only; dependents go away with the board inside one transaction (REQ-CAS-01). */
export function makeDeleteBoard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { boardId } = parseInput(boardIdSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:delete");
    await deps.uow.run((tx) => tx.boards.delete(boardId));
  };
}
