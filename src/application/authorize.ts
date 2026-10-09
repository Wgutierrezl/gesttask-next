import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { can, type BoardAction } from "@/domain/policy/board-policy";
import type { BoardRole } from "@/domain/value-objects/board-role";
import type { Actor } from "./actor";
import type { MemberRepo } from "./ports/repositories";

/**
 * The single authorization gate (REQ-ISO-01). Non-members get NotFound so a board's existence
 * never leaks; members with an insufficient role get Forbidden.
 */
export async function requireBoardAccess(
  members: MemberRepo,
  actor: Actor,
  boardId: string,
  action: BoardAction,
): Promise<BoardRole> {
  const membership = await members.find(boardId, actor.userId);
  if (!membership) throw new NotFoundError();
  if (!can(membership.role, action)) throw new ForbiddenError();
  return membership.role;
}
