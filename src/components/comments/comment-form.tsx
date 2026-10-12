"use client";

import { createCommentAction } from "@/app/_actions/comments";
import { Field, Textarea } from "@/components/ui/field";
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
            <Field label="Add a comment" error={error?.join(" ")}>
              <Textarea id="comment-body" name="body" required maxLength={COMMENT_MAX_LENGTH} rows={3} />
            </Field>
            {canAttach ? (
              <AttachmentPicker files={attachments.files} onPick={attachments.add} onRemove={attachments.remove} onRetry={attachments.retry} demoGuest={demoGuest} />
            ) : (
              <p className="text-sm text-fg-muted">Guests can comment, but only members can attach files.</p>
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
