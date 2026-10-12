"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateBoardAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { Alert, Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function EditBoardForm({ board }: { board: { id: string; name: string; description: string } }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(updateBoardAction, undefined);
  const failure = failureOf(state);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="boardId" value={board.id} />
      <Field label={t("boards.name")} required error={failure?.fieldErrors?.name?.join(" ")}>
        <Input id="name" name="name" defaultValue={board.name} maxLength={100} required />
      </Field>
      <Field label={t("boards.descriptionField")} error={failure?.fieldErrors?.description?.join(" ")}>
        <Textarea id="description" name="description" rows={3} defaultValue={board.description} maxLength={2000} />
      </Field>
      <FormError failure={failure} inlineFields={["name", "description"]} />
      {state?.ok ? <Alert tone="success">{t("board.edit.saved")}</Alert> : null}
      <div>
        <SubmitButton pendingLabel={t("board.edit.saving")}>{t("board.edit.save")}</SubmitButton>
      </div>
    </form>
  );
}
