"use client";

import { useTranslations } from "next-intl";
import { deleteCommentAction } from "@/app/_actions/comments";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";

/** A required checkbox, so confirming also works without JavaScript. */
export function DeleteCommentForm({ commentId }: { commentId: string }) {
  const t = useTranslations("comments");
  const errorId = `delete-comment-${commentId}-error`;
  return (
    <MutationForm action={deleteCommentAction} hidden={{ commentId }} inlineFields={["confirm"]} className="flex flex-col gap-2">
      {(failure) => {
        const error = failure?.fieldErrors?.confirm;
        return (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className="mt-0.5 size-4 accent-danger-600" />
              <span>{t("deleteConfirm")}</span>
            </label>
            {error ? <p id={errorId} className="text-sm text-danger-fg">{error.join(" ")}</p> : null}
            <div>
              <SubmitButton variant="danger" pendingLabel={t("deleting")}>{t("deleteSubmit")}</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
