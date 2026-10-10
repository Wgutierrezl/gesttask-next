import { NotFoundError } from "@/domain/errors";
import type { Comment } from "@/domain/entities/comment";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { loadTask } from "../../resources";
import { parseInput } from "../../schemas/parse";
import { createCommentSchema } from "../../schemas/comment";

/**
 * Anyone who can see the board may comment with text, guests included (REQ-BRD-06). The author is the session user and
 * the board comes from the task, never from the payload. The task is re-read in the transaction, which also takes the
 * lock a concurrent task delete waits on.
 */
export function makeCreateComment(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Comment> => {
    const { taskId, body } = parseInput(createCommentSchema, input);
    await loadTask(deps.repos, actor, taskId, "comment:create");
    const now = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const task = await tx.tasks.findById(taskId);
      if (!task) throw new NotFoundError();
      const comment: Comment = { id: deps.ids.next(), taskId, boardId: task.boardId, authorId: actor.userId, body, createdAt: now };
      await tx.comments.insert(comment);
      return comment;
    });
  };
}
