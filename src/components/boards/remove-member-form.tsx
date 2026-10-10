"use client";

import { useActionState } from "react";
import { removeMemberAction } from "@/app/_actions/members";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

export function RemoveMemberForm({ boardId, userId }: { boardId: string; userId: string }) {
  const [state, formAction] = useActionState(removeMemberAction, undefined);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="danger" pendingLabel="Removing...">
        Remove
      </SubmitButton>
      <FormError failure={failureOf(state)} />
    </form>
  );
}
