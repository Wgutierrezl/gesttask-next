"use client";

import { useActionState } from "react";
import { updateBoardAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { FormField } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

export function EditBoardForm({ board }: { board: { id: string; name: string; description: string } }) {
  const [state, formAction] = useActionState(updateBoardAction, undefined);
  const failure = failureOf(state);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="boardId" value={board.id} />
      <FormField label="Name" name="name" defaultValue={board.name} maxLength={100} errors={failure?.fieldErrors?.name} />
      <FormField label="Description" name="description" multiline required={false} defaultValue={board.description} maxLength={2000} errors={failure?.fieldErrors?.description} />
      <FormError failure={failure} inlineFields={["name", "description"]} />
      {state?.ok ? <p role="status" className="text-sm text-green-800">Saved.</p> : null}
      <div>
        <SubmitButton pendingLabel="Saving...">Save changes</SubmitButton>
      </div>
    </form>
  );
}
