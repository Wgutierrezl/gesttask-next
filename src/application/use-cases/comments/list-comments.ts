import type { AttachmentView, CommentView } from "@/domain/entities/comment";
import { NotFoundError } from "@/domain/errors";
import { can } from "@/domain/policy/board-policy";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { UserDirectory } from "../../ports/services";
import { listCommentsSchema } from "../../schemas/comment";
import { parseInput } from "../../schemas/parse";

export const DELETED_USER = "Deleted user";

/** Comments of a task, oldest first, with author names (never emails) and what the viewer may change. */
export function makeListComments(deps: AppDeps, users: UserDirectory) {
  return async (actor: Actor, input: unknown): Promise<CommentView[]> => {
    const { taskId, ...page } = parseInput(listCommentsSchema, input);
    const task = await deps.repos.tasks.findById(taskId);
    if (!task) throw new NotFoundError();
    const role = await requireBoardAccess(deps.repos.members, actor, task.boardId, "board:view");
    const comments = await deps.repos.comments.listByTask(taskId, page);
    const authorIds = [...new Set(comments.flatMap((c) => (c.authorId === null ? [] : [c.authorId])))];
    const names = new Map((await users.findByIds(authorIds)).map((profile) => [profile.id, profile.name]));
    const attachments = new Map<string, AttachmentView[]>();
    for (const a of await deps.repos.attachments.listByComments(comments.map((c) => c.id))) {
      const view: AttachmentView = { id: a.id, fileName: a.fileName, contentType: a.contentType, size: a.size };
      attachments.set(a.commentId!, [...(attachments.get(a.commentId!) ?? []), view]);
    }
    return comments.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      authorId: c.authorId,
      authorName: (c.authorId !== null && names.get(c.authorId)) || DELETED_USER,
      body: c.body,
      createdAt: c.createdAt,
      attachments: attachments.get(c.id) ?? [],
      canManage: c.authorId === actor.userId || can(role, "comment:moderate"),
    }));
  };
}
