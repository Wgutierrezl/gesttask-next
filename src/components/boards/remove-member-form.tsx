"use client";

import { useActionState } from "react";
import { removeMemberAction } from "@/app/_actions/members";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

interface RemoveMemberFormProps {
  boardId: string;
  userId: string;
  name: string;
  /** Removing oneself ends the owner's access, so the confirmation says so. */
  isSelf?: boolean;
}

/** Removal needs an explicit confirmation (a required checkbox, so it also works without JavaScript). */
export function RemoveMemberForm({ boardId, userId, name, isSelf }: RemoveMemberFormProps) {
  const [state, formAction] = useActionState(removeMemberAction, undefined);
  const failure = failureOf(state);
  const confirmError = failure?.fieldErrors?.confirm;
  const errorId = `confirm-error-${userId}`;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? errorId : undefined}
          className="mt-0.5"
        />
        <span>{isSelf ? "I will lose access to this board" : `${name} will lose access to this board`}</span>
      </label>
      {confirmError ? (
        <p id={errorId} role="alert" className="text-xs text-red-700">
          {confirmError.join(" ")}
        </p>
      ) : null}
      <FormError failure={failure} inlineFields={["confirm"]} />
      <div>
        <SubmitButton variant="danger" pendingLabel="Removing..." ariaLabel={`Remove ${name}`}>
          Remove
        </SubmitButton>
      </div>
    </form>
  );
}
