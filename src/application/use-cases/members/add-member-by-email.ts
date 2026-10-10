import type { BoardMember } from "@/domain/entities/board";
import { ForbiddenError, ValidationError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { RateLimiter, UserDirectory } from "../../ports/services";
import { parseInput } from "../../schemas/parse";
import { addMemberByEmailSchema } from "../../schemas/member";
import { enforceRateLimit } from "../auth/_rate-limit";

export const LOOKUPS_PER_ACTOR = { limit: 30, windowSeconds: 3600 };
/** Looser than the per-actor rule so a household or office behind one address is not locked out by a neighbour. */
export const LOOKUPS_PER_CLIENT = { limit: 60, windowSeconds: 3600 };

/**
 * Owner invites a registered account by email. Looking up emails is an enumeration oracle (ADR 0004), so it is
 * limited: demo-session users cannot do it at all and everyone else is capped per account and per client.
 * Requests refused for authorization or validation reasons never reach the limiter, so they spend no quota.
 * `clientKey` is the opaque, already-hashed client key the web layer derives from the request.
 */
export function makeAddMemberByEmail(
  deps: AppDeps,
  ext: { users: UserDirectory; limiter: RateLimiter; clientKey: () => Promise<string> },
) {
  return async (actor: Actor, input: unknown): Promise<BoardMember> => {
    const { boardId, email, role } = parseInput(addMemberByEmailSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "member:manage");
    if (actor.isGuest) throw new ForbiddenError("Create an account to invite people");
    await enforceRateLimit(ext.limiter, `add-member-lookup:${actor.userId}`, LOOKUPS_PER_ACTOR);
    await enforceRateLimit(ext.limiter, `add-member-lookup-client:${await ext.clientKey()}`, LOOKUPS_PER_CLIENT);
    const found = await ext.users.findByEmail(email);
    if (!found) throw new ValidationError("Invalid input", { email: ["No account found with that email"] });
    const member: BoardMember = { boardId, userId: found.id, role };
    await deps.uow.run((tx) => tx.members.insert(member));
    return member;
  };
}
