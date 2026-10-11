"use client";

import { createPipelineAction } from "@/app/_actions/pipelines";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";

/** New pipelines start with the stages To do, In progress and Done. */
export function CreatePipelineForm({ boardId, onSuccess, onCancel }: { boardId: string; onSuccess?: () => void; onCancel?: () => void }) {
  return (
    <MutationForm action={createPipelineAction} hidden={{ boardId }} inlineFields={["name", "description"]} onSuccess={onSuccess} className="flex flex-col gap-4">
      {(failure) => (
        <>
          <Field label="Name" required error={failure?.fieldErrors?.name?.join(" ")}>
            <Input name="name" maxLength={100} required />
          </Field>
          <Field label="Description" error={failure?.fieldErrors?.description?.join(" ")}>
            <Textarea name="description" rows={3} maxLength={2000} />
          </Field>
          <p className="text-xs text-slate-600">A new pipeline starts with the stages To do, In progress and Done.</p>
          <FormFooter submitLabel="Create" pendingLabel="Creating..." onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
