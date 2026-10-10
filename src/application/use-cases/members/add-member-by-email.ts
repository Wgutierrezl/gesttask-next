import type { BoardMember } from "@/domain/entities/board";
import { ForbiddenError, ValidationError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { RateLimiter, UserDirectory } from "../../ports/services";
import { parseInput } from "../../schemas/parse";
import { addMemberByEmailSchema } from "../../schemas/member";
import { enforceRateLimit } from "../auth/_rate-limit";

const LOOKUPS_PER_HOUR = { limit: 30, windowSeconds: 3600 };

/**
 * Owner invites a registered account by email. Looking up emails is an enumeration oracle, so it is limited:
 * demo-session users cannot do it at all and everyone else gets 30 lookups per hour.
 */
export function makeAddMemberByEmail(deps: AppDeps, ext: { users: UserDirectory; limiter: RateLimiter }) {
  return async (actor: Actor, input: unknown): Promise<BoardMember> => {
    const { boardId, email, role } = parseInput(addMemberByEmailSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "member:manage");
    if (actor.isGuest) throw new ForbiddenError("Create an account to invite people");
    await enforceRateLimit(ext.limiter, `add-member-lookup:${actor.userId}`, LOOKUPS_PER_HOUR);
    const found = await ext.users.findByEmail(email);
    if (!found) throw new ValidationError("Invalid input", { email: ["No account found with that email"] });
    const member: BoardMember = { boardId, userId: found.id, role };
    await deps.uow.run((tx) => tx.members.insert(member));
    return member;
  };
}
