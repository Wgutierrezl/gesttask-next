"use client";

import { editCommentAction } from "@/app/_actions/comments";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { COMMENT_MAX_LENGTH } from "./limits";

export function EditCommentForm({ commentId, body }: { commentId: string; body: string }) {
  return (
    <MutationForm action={editCommentAction} hidden={{ commentId }} inlineFields={["body"]} className="flex flex-col gap-2">
      {(failure) => {
        const error = failure?.fieldErrors?.body;
        const errorId = `edit-comment-${commentId}-error`;
        return (
          <>
            <label htmlFor={`edit-comment-${commentId}`} className="text-sm font-medium">Edit comment</label>
            <textarea
              id={`edit-comment-${commentId}`}
              name="body"
              defaultValue={body}
              required
              maxLength={COMMENT_MAX_LENGTH}
              rows={3}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            {error ? <p id={errorId} role="alert" className="text-sm text-red-700">{error.join(" ")}</p> : null}
            <div>
              <SubmitButton pendingLabel="Saving...">Save comment</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
