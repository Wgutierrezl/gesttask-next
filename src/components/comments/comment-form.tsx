"use client";

import { createCommentAction } from "@/app/_actions/comments";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { AttachmentPicker } from "./attachment-picker";
import { COMMENT_MAX_LENGTH } from "./limits";
import { useAttachments } from "./use-attachments";

interface CommentFormProps {
  taskId: string;
  /** Members and owners may attach files; read-only guests may only write text (REQ-BRD-06). */
  canAttach: boolean;
  /** A demo session: its attachment quota is worth saying out loud. */
  demoGuest: boolean;
}

export function CommentForm({ taskId, canAttach, demoGuest }: CommentFormProps) {
  const attachments = useAttachments(taskId);
  return (
    <MutationForm action={createCommentAction} hidden={{ taskId }} inlineFields={["body"]} onSuccess={attachments.clear} className="flex flex-col gap-2">
      {(failure) => {
        const error = failure?.fieldErrors?.body;
        return (
          <>
            <label htmlFor="comment-body" className="text-sm font-medium">Add a comment</label>
            <textarea
              id="comment-body"
              name="body"
              required
              maxLength={COMMENT_MAX_LENGTH}
              rows={3}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "comment-body-error" : undefined}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            {error ? <p id="comment-body-error" role="alert" className="text-sm text-red-700">{error.join(" ")}</p> : null}
            {canAttach ? (
              <AttachmentPicker files={attachments.files} onPick={attachments.add} onRemove={attachments.remove} demoGuest={demoGuest} />
            ) : (
              <p className="text-sm text-gray-600">Guests can comment, but only members can attach files.</p>
            )}
            <div>
              <SubmitButton pendingLabel="Posting..." disabled={attachments.busy}>Comment</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
