"use client";

import { useTranslations } from "next-intl";
import { createPipelineAction } from "@/app/_actions/pipelines";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";
import { AddStageLink, FlowPreview, StagesEditor, useStageRows } from "./stages-editor";

/**
 * New pipelines start with the stages the visitor lists: To do, In progress and Done by default, named in their language
 * (those names are what gets saved). Each row posts as a `stages` field, so the form needs no client-side serialization.
 */
export function CreatePipelineForm({ boardId, onSuccess, onCancel }: { boardId: string; onSuccess?: () => void; onCancel?: () => void }) {
  const t = useTranslations();
  const editor = useStageRows([t("pipeline.defaultNames.todo"), t("pipeline.defaultNames.inProgress"), t("pipeline.defaultNames.done")]);
  const inlineFields = ["name", "description", "stages", ...editor.rows.map((_, index) => `stages.${index}`)];
  return (
    <MutationForm action={createPipelineAction} hidden={{ boardId }} inlineFields={inlineFields} onSuccess={onSuccess} className="flex flex-col gap-5">
      {(failure) => (
        <>
          <Field label={t("boards.name")} required error={failure?.fieldErrors?.name?.join(" ")}>
            <Input name="name" maxLength={100} required placeholder={t("pipeline.namePlaceholder")} />
          </Field>
          <Field label={t("boards.descriptionField")} error={failure?.fieldErrors?.description?.join(" ")}>
            <Textarea name="description" rows={3} maxLength={2000} placeholder={t("pipeline.descriptionPlaceholder")} />
          </Field>
          <section aria-labelledby="pipeline-stages-heading" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="pipeline-stages-heading" className="text-sm font-medium text-fg-strong">{t("pipeline.form.stages")}</h3>
              <AddStageLink editor={editor} />
            </div>
            <p className="text-xs text-fg-muted">{t("pipeline.form.help")}</p>
            <StagesEditor editor={editor} errors={(index) => failure?.fieldErrors?.[`stages.${index}`]?.join(" ")} />
            {failure?.fieldErrors?.stages ? <p className="text-xs text-danger-fg">{failure.fieldErrors.stages.join(" ")}</p> : null}
          </section>
          <FlowPreview rows={editor.rows} />
          <FormFooter submitLabel={t("pipeline.submit")} pendingLabel={t("pipeline.submitting")} onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
