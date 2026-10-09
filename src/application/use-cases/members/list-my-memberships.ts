import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";

/** Deliberately takes no user id: nobody can ask for someone else's memberships (REQ-ISO-05). */
export function makeListMyMemberships(deps: AppDeps) {
  return (actor: Actor): Promise<BoardMember[]> => deps.repos.members.listByUser(actor.userId);
}
