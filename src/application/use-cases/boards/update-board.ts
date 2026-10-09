import { NotFoundError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { updateBoardSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

export function makeUpdateBoard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Board> => {
    const { boardId, ...changes } = parseInput(updateBoardSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:update");
    const current = await deps.repos.boards.findById(boardId);
    if (!current) throw new NotFoundError();
    const updated: Board = {
      ...current,
      name: changes.name ?? current.name,
      description: changes.description ?? current.description,
      status: changes.status ?? current.status,
    };
    await deps.repos.boards.update(updated);
    return updated;
  };
}
