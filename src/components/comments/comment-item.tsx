import { LocalTime } from "@/components/kanban/local-time";
import { DeleteCommentForm } from "./delete-comment-form";
import { EditCommentForm } from "./edit-comment-form";
import { attachmentDownloadPath, formatBytes } from "./format";
import type { CommentRow } from "./types";

/** One comment. The text is rendered as text (React escapes it), never as HTML. */
export function CommentItem({ comment }: { comment: CommentRow }) {
  return (
    <article aria-label={`Comment by ${comment.authorName}`} className="rounded border border-gray-200 p-3">
      <header className="flex flex-wrap items-baseline gap-2 text-sm">
        <strong>{comment.authorName}</strong>
        <span className="text-gray-600"><LocalTime iso={comment.createdAt} label="Posted" /></span>
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
      {comment.attachments.length > 0 ? (
        <ul aria-label="Attachments" className="mt-2 flex flex-col gap-1 text-sm">
          {comment.attachments.map((file) => (
            <li key={file.id}>
              <a href={attachmentDownloadPath(file.id)} className="underline">{file.fileName}</a>{" "}
              <span className="text-gray-600">({formatBytes(file.size)})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {comment.canManage ? (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <details>
            <summary className="cursor-pointer underline">Edit</summary>
            <div className="mt-2"><EditCommentForm commentId={comment.id} body={comment.body} /></div>
          </details>
          <details>
            <summary className="cursor-pointer underline">Delete</summary>
            <div className="mt-2"><DeleteCommentForm commentId={comment.id} /></div>
          </details>
        </div>
      ) : null}
    </article>
  );
}
