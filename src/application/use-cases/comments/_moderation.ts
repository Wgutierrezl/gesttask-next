import type { Comment } from "@/domain/entities/comment";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { MemberRepo } from "../../ports/repositories";

/**
 * Own comments need only `comment:modify-own` (every role has it, guests included); someone else's needs
 * `comment:moderate` (board owners). The board is the comment's own, so a foreign id answers NotFound.
 */
export async function requireCommentAccess(members: MemberRepo, actor: Actor, comment: Comment): Promise<void> {
  await requireBoardAccess(members, actor, comment.boardId, comment.authorId === actor.userId ? "comment:modify-own" : "comment:moderate");
}
