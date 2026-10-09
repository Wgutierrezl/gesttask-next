import { ConflictError } from "@/domain/errors";
import type { BoardMember } from "@/domain/entities/board";
import type { MemberRepo } from "../../ports/repositories";

/**
 * Locks the board's owner rows. Call it BEFORE locking the target member (lock order: owners, then
 * target) so two concurrent demotions/removals of different owners cannot deadlock.
 */
export function countOwners(members: MemberRepo, boardId: string): Promise<number> {
  return members.countByRole(boardId, "owner");
}

/** A board must always keep at least one owner (REQ-BRD-04). */
export function assertNotLastOwner(ownerCount: number, target: BoardMember): void {
  if (target.role === "owner" && ownerCount <= 1) {
    throw new ConflictError("A board needs at least one owner");
  }
}
