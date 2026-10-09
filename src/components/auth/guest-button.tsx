"use client";

import { useActionState } from "react";
import { signInGuestAction } from "@/app/_actions/auth";
import { FormError } from "./form-error";

/** One-click demo (REQ-AUTH-02): no form fields, the server creates the guest and its sandbox board. */
export function GuestButton() {
  const [state, formAction, pending] = useActionState(signInGuestAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError failure={state} />
      <button type="submit" disabled={pending} className="rounded border border-gray-900 px-4 py-2 text-sm disabled:opacity-60">
        {pending ? "Preparing your demo..." : "Try the demo"}
      </button>
    </form>
  );
}
