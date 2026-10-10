"use client";

import { useActionState } from "react";
import { deleteBoardAction } from "@/app/_actions/boards";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteBoardForm({ board }: { board: { id: string; name: string } }) {
  const [state, formAction] = useActionState(deleteBoardAction, undefined);
  const failure = failureOf(state);
  const confirmError = failure?.fieldErrors?.confirm;
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="boardId" value={board.id} />
      <p className="text-sm text-gray-700">
        Deleting <strong>{board.name}</strong> permanently removes its pipelines, tasks and memberships. This cannot be undone.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "confirm-error" : undefined}
          className="mt-0.5"
        />
        <span>I understand that this board and all its data will be deleted.</span>
      </label>
      {confirmError ? (
        <p id="confirm-error" className="text-sm text-red-700">
          {confirmError.join(" ")}
        </p>
      ) : null}
      <FormError failure={failure} />
      <div>
        <SubmitButton variant="danger" pendingLabel="Deleting...">
          Delete board
        </SubmitButton>
      </div>
    </form>
  );
}
