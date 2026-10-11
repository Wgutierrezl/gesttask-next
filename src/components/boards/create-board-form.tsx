"use client";

import { createBoardAction } from "@/app/_actions/boards";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { FormFooter } from "@/components/ui/form-footer";

export function CreateBoardForm({ onCancel }: { onCancel?: () => void }) {
  return (
    <MutationForm action={createBoardAction} inlineFields={["name", "description"]} className="flex flex-col gap-4">
      {(failure) => (
        <>
          <Field label="Name" required error={failure?.fieldErrors?.name?.join(" ")}>
            <Input name="name" maxLength={100} required />
          </Field>
          <Field label="Description" error={failure?.fieldErrors?.description?.join(" ")}>
            <Textarea name="description" rows={3} maxLength={2000} />
          </Field>
          <FormFooter submitLabel="Create" pendingLabel="Creating..." onCancel={onCancel} />
        </>
      )}
    </MutationForm>
  );
}
