import type { CommentView } from "@/application/use-cases/comments/list-comments";
import type { CommentRow } from "@/components/comments/types";

/** The serializable shape the comment components take: dates as ISO strings, nothing the viewer may not see. */
export function toCommentRow(comment: CommentView): CommentRow {
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    canManage: comment.canManage,
    attachments: comment.attachments.map(({ id, fileName, contentType, size }) => ({ id, fileName, contentType, size })),
  };
}
