"use client";

import { useActionState } from "react";
import { createBoardAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateBoardForm() {
  const [state, formAction] = useActionState(createBoardAction, undefined);
  const failure = failureOf(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="Name" name="name" maxLength={100} errors={failure?.fieldErrors?.name} />
      <FormField label="Description" name="description" multiline required={false} maxLength={2000} errors={failure?.fieldErrors?.description} />
      <FormError failure={failure} />
      <div>
        <SubmitButton pendingLabel="Creating...">Create board</SubmitButton>
      </div>
    </form>
  );
}
