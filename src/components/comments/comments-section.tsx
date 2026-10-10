import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import type { CommentRow } from "./types";

interface CommentsSectionProps {
  taskId: string;
  comments: CommentRow[];
  /** More comments exist than this page loaded. */
  truncated: boolean;
  canAttach: boolean;
  demoGuest: boolean;
}

export function CommentsSection({ taskId, comments, truncated, canAttach, demoGuest }: CommentsSectionProps) {
  return (
    <section aria-labelledby="comments-heading" className="flex flex-col gap-4">
      <h2 id="comments-heading" className="text-lg font-medium">Comments ({comments.length})</h2>
      {truncated ? <p role="status" className="rounded bg-yellow-50 px-3 py-2 text-sm">Showing the first 200 comments of this task.</p> : null}
      {comments.length === 0 ? <p className="text-sm text-gray-600">No comments yet.</p> : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
        </div>
      )}
      <CommentForm taskId={taskId} canAttach={canAttach} demoGuest={demoGuest} />
    </section>
  );
}
