"use client";

import { useTranslations } from "next-intl";
import { editCommentAction } from "@/app/_actions/comments";
import { Field, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { COMMENT_MAX_LENGTH } from "./limits";

export function EditCommentForm({ commentId, body }: { commentId: string; body: string }) {
  const t = useTranslations("comments");
  return (
    <MutationForm action={editCommentAction} hidden={{ commentId }} inlineFields={["body"]} className="flex flex-col gap-2">
      {(failure) => {
        const error = failure?.fieldErrors?.body;
        return (
          <>
            <Field label={t("editLabel")} error={error?.join(" ")}>
              <Textarea id={`edit-comment-${commentId}`} name="body" defaultValue={body} required maxLength={COMMENT_MAX_LENGTH} rows={3} />
            </Field>
            <div>
              <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
            </div>
          </>
        );
      }}
    </MutationForm>
  );
}
