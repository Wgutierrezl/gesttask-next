import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { commentIdSchema } from "../../schemas/comment";
import { parseInput } from "../../schemas/parse";
import { enqueueAttachmentCleanup } from "../../storage-cleanup";
import { requireCommentAccess } from "./_moderation";

/** The comment's attachment objects are queued for deletion in the same transaction as the rows (REQ-CAS-02). */
export function makeDeleteComment(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { commentId } = parseInput(commentIdSchema, input);
    const snapshot = await deps.repos.comments.findById(commentId);
    if (!snapshot) throw new NotFoundError();
    await requireCommentAccess(deps.repos.members, actor, snapshot);
    await deps.uow.run(async (tx) => {
      if (!(await tx.comments.findById(commentId))) throw new NotFoundError();
      await enqueueAttachmentCleanup(tx, { commentId });
      await tx.comments.delete(commentId);
    });
  };
}
