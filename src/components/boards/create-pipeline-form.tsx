"use client";

import { useActionState } from "react";
import { createPipelineAction } from "@/app/_actions/pipelines";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

/** New pipelines start with the stages To do, In progress and Done. */
export function CreatePipelineForm({ boardId }: { boardId: string }) {
  const [state, formAction] = useActionState(createPipelineAction, undefined);
  const failure = failureOf(state);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="boardId" value={boardId} />
      <FormField label="Name" name="name" maxLength={100} errors={failure?.fieldErrors?.name} />
      <FormField label="Description" name="description" multiline required={false} maxLength={2000} errors={failure?.fieldErrors?.description} />
      <FormError failure={failure} inlineFields={["name", "description"]} />
      <p className="text-xs text-gray-600">A new pipeline starts with the stages To do, In progress and Done.</p>
      <div>
        <SubmitButton pendingLabel="Creating...">Create pipeline</SubmitButton>
      </div>
    </form>
  );
}
