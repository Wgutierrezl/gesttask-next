import { NotFoundError } from "@/domain/errors";
import type { Comment } from "@/domain/entities/comment";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { editCommentSchema } from "../../schemas/comment";
import { parseInput } from "../../schemas/parse";
import { requireCommentAccess } from "./_moderation";

/** Only the text changes: the author, the task and the attachments stay as they were. */
export function makeEditComment(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Comment> => {
    const { commentId, body } = parseInput(editCommentSchema, input);
    const snapshot = await deps.repos.comments.findById(commentId);
    if (!snapshot) throw new NotFoundError();
    await requireCommentAccess(deps.repos.members, actor, snapshot);
    return deps.uow.run(async (tx) => {
      const current = await tx.comments.findById(commentId);
      if (!current) throw new NotFoundError();
      await tx.comments.updateBody(commentId, body);
      return { ...current, body };
    });
  };
}
