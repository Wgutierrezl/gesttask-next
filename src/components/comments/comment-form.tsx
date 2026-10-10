"use client";

import { createCommentAction } from "@/app/_actions/comments";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { COMMENT_MAX_LENGTH } from "./limits";

export function CommentForm({ taskId }: { taskId: string }) {
  return (
    <MutationForm action={createCommentAction} hidden={{ taskId }} inlineFields={["body"]} className="flex flex-col gap-2">
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
            <div>
              <SubmitButton pendingLabel="Posting...">Comment</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
