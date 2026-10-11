"use client";

import { useActionState } from "react";
import { signInGuestAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { FormError } from "./form-error";

/** One-click demo (REQ-AUTH-02): no form fields, the server creates the guest and its sandbox board. */
export function GuestButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const [state, formAction, pending] = useActionState(signInGuestAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError failure={state} />
      <Button type="submit" variant={variant} disabled={pending} className="w-full">
        {pending ? "Preparing your demo..." : "Try the demo"}
      </Button>
    </form>
  );
}
