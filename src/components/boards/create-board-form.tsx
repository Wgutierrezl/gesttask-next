"use client";

import { createBoardAction } from "@/app/_actions/boards";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MutationForm } from "@/components/ui/mutation-form";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateBoardForm() {
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
          <div>
            <SubmitButton pendingLabel="Creating...">Create board</SubmitButton>
          </div>
        </>
      )}
    </MutationForm>
  );
}
