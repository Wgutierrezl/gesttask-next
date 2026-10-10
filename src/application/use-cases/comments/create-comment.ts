import { NotFoundError } from "@/domain/errors";
import type { Comment } from "@/domain/entities/comment";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import type { StoragePort } from "../../ports/services";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createCommentSchema } from "../../schemas/comment";
import { assertLinkable, verifyUploads } from "../attachments/_uploads";

/**
 * Anyone who can see the board may comment with text, guests included; attaching files needs `attachment:create`
 * (REQ-BRD-06). The author is the session user and the board comes from the task, never from the payload.
 * Uploads are checked against the storage BEFORE the transaction (no network call while locks are held) and linked
 * inside it, re-validated against the locked rows, so a comment and its attachments appear together or not at all.
 */
export function makeCreateComment(deps: AppDeps, ext: { storage: StoragePort }) {
  return async (actor: Actor, input: unknown): Promise<Comment> => {
    const { taskId, body, attachmentIds: requested } = parseInput(createCommentSchema, input);
    const attachmentIds = [...new Set(requested)];
    const task = await loadTask(deps.repos, actor, taskId, attachmentIds.length > 0 ? "attachment:create" : "comment:create");
    const sizes = attachmentIds.length
      ? await verifyUploads(ext.storage, assertLinkable(await deps.repos.attachments.findManyByIds(attachmentIds), attachmentIds, actor, task.boardId))
      : new Map<string, number>();
    const now = deps.clock.now();
    return deps.uow.run(async (tx) => {
      // Global lock order: board, then task. The comment insert takes KEY SHARE on the board, so locking the task first
      // would deadlock with a board delete (which holds the board and waits for its tasks). A task never changes board.
      if (!(await tx.boards.findById(task.boardId))) throw new NotFoundError();
      const current = await tx.tasks.findById(taskId);
      if (!current) throw new NotFoundError();
      const uploads = assertLinkable(await tx.attachments.findManyByIds(attachmentIds), attachmentIds, actor, current.boardId);
      const comment: Comment = { id: deps.ids.next(), taskId, boardId: current.boardId, authorId: actor.userId, body, createdAt: now };
      await tx.comments.insert(comment);
      for (const upload of uploads) await tx.attachments.confirm(upload.id, { commentId: comment.id, size: sizes.get(upload.id)! });
      return comment;
    });
  };
}
