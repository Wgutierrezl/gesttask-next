import type { Board } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { listMyBoardsSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

/** Always the actor's own boards, paginated (default 50, max 200); empty is a successful `[]` (REQ-BRD-02). */
export function makeListMyBoards(deps: AppDeps) {
  return async (actor: Actor, input: unknown = {}): Promise<Board[]> => {
    const page = parseInput(listMyBoardsSchema, input);
    return deps.repos.boards.listByMember(actor.userId, page);
  };
}
