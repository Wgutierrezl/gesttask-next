import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { addMemberSchema } from "../../schemas/member";
import { parseInput } from "../../schemas/parse";

/** Duplicates surface as ConflictError from the repository's unique key, never from check-then-insert. */
export function makeAddMember(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<BoardMember> => {
    const member = parseInput(addMemberSchema, input);
    await requireBoardAccess(deps.repos.members, actor, member.boardId, "member:manage");
    await deps.uow.run((tx) => tx.members.insert(member));
    return member;
  };
}
