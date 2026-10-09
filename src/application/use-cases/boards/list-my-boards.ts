import type { Board } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";

/** Always the actor's own boards; an empty list is a successful `[]` (REQ-BRD-02). */
export function makeListMyBoards(deps: AppDeps) {
  return (actor: Actor): Promise<Board[]> => deps.repos.boards.listByMember(actor.userId);
}
