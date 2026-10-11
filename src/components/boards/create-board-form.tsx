"use client";

import { useTranslations } from "next-intl";
import { createBoardAction } from "@/app/_actions/boards";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";

export function CreateBoardForm({ onCancel }: { onCancel?: () => void }) {
  const t = useTranslations("boards");
  return (
    <MutationForm action={createBoardAction} inlineFields={["name", "description"]} className="flex flex-col gap-4">
      {(failure) => (
        <>
          <Field label={t("name")} required error={failure?.fieldErrors?.name?.join(" ")}>
            <Input name="name" maxLength={100} required />
          </Field>
          <Field label={t("descriptionField")} error={failure?.fieldErrors?.description?.join(" ")}>
            <Textarea name="description" rows={3} maxLength={2000} />
          </Field>
          <FormFooter submitLabel={t("submit")} pendingLabel={t("submitting")} onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
