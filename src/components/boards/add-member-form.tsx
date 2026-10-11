"use client";

import { useActionState } from "react";
import { addMemberAction } from "@/app/_actions/members";
import { failureOf } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";
import { Alert, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { RoleSelect } from "./role-select";

/** Invite a registered account by email. Demo-session users cannot invite; the server explains why. */
export function AddMemberForm({ boardId }: { boardId: string }) {
  const [state, formAction] = useActionState(addMemberAction, undefined);
  const failure = failureOf(state);
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input type="hidden" name="boardId" value={boardId} />
      <Field label="Email" required error={failure?.fieldErrors?.email?.join(" ")}>
        <Input id="email" name="email" type="email" autoComplete="off" required />
      </Field>
      <RoleSelect id="role" label="Role" defaultValue="member" />
      <FormError failure={failure} inlineFields={["email"]} />
      {state?.ok ? <Alert tone="success">Member added.</Alert> : null}
      <div>
        <SubmitButton pendingLabel="Adding...">Add member</SubmitButton>
      </div>
    </form>
  );
}
