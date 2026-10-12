import { Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LocalTime } from "@/components/kanban/local-time";
import { DeleteCommentForm } from "./delete-comment-form";
import { EditCommentForm } from "./edit-comment-form";
import { attachmentDownloadPath, formatBytes } from "./format";
import type { CommentRow } from "./types";

const DISCLOSURE = "cursor-pointer rounded text-fg-strong underline hover:text-fg focus-visible:outline-2 focus-visible:outline-ring";

/** One comment. The text is rendered as text (React escapes it), never as HTML. */
export function CommentItem({ comment }: { comment: CommentRow }) {
  return (
    <article aria-label={`Comment by ${comment.authorName}`} className="flex gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <Avatar name={comment.authorName} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-baseline gap-2 text-sm">
          <strong className="text-fg">{comment.authorName}</strong>
          <span className="text-fg-muted"><LocalTime iso={comment.createdAt} label="Posted" /></span>
        </header>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fg-secondary">{comment.body}</p>
        {comment.attachments.length > 0 ? (
          <ul aria-label="Attachments" className="mt-3 flex flex-col gap-1 text-sm">
            {comment.attachments.map((file) => (
              <li key={file.id} className="flex items-center gap-2">
                <Paperclip aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
                <a href={attachmentDownloadPath(file.id)} className="min-w-0 truncate rounded text-brand-link underline hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">{file.fileName}</a>{" "}
                <span className="shrink-0 text-fg-muted">({formatBytes(file.size)})</span>
              </li>
            ))}
          </ul>
        ) : null}
        {comment.canManage ? (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <details>
              <summary className={DISCLOSURE}>Edit</summary>
              <div className="mt-2"><EditCommentForm commentId={comment.id} body={comment.body} /></div>
            </details>
            <details>
              <summary className={DISCLOSURE}>Delete</summary>
              <div className="mt-2"><DeleteCommentForm commentId={comment.id} /></div>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
