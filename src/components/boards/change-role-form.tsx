"use client";

import { useActionState } from "react";
import { changeMemberRoleAction } from "@/app/_actions/members";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { RoleSelect } from "./role-select";
import type { MemberView } from "./members-panel";

export function ChangeRoleForm({ boardId, member }: { boardId: string; member: MemberView }) {
  const [state, formAction] = useActionState(changeMemberRoleAction, undefined);
  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="userId" value={member.userId} />
      <RoleSelect id={`role-${member.userId}`} label={`Role of ${member.name}`} defaultValue={member.role} hideLabel />
      <SubmitButton variant="secondary" pendingLabel="Saving...">
        Update
      </SubmitButton>
      <FormError failure={failureOf(state)} />
    </form>
  );
}
