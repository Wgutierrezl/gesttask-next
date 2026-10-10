import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { listMyMembershipsSchema } from "../../schemas/member";
import { parseInput } from "../../schemas/parse";

/**
 * Deliberately takes no user id: nobody can ask for someone else's memberships (REQ-ISO-05). `boardIds`
 * narrows the answer to the boards on screen; boards the caller does not belong to simply do not appear.
 */
export function makeListMyMemberships(deps: AppDeps) {
  return async (actor: Actor, input: unknown = {}): Promise<BoardMember[]> => {
    const { boardIds } = parseInput(listMyMembershipsSchema, input ?? {});
    return boardIds ? deps.repos.members.listByUserInBoards(actor.userId, boardIds) : deps.repos.members.listByUser(actor.userId);
  };
}
