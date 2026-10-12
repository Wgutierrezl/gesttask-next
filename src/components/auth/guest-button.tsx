"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { signInGuestAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { FormError } from "./form-error";

/** One-click demo (REQ-AUTH-02): no form fields, the server creates the guest and its sandbox board. */
export function GuestButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signInGuestAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError failure={state} />
      <Button type="submit" variant={variant} disabled={pending} className="h-12 w-full rounded-xl">
        {pending ? t("preparingDemo") : t("tryDemo")}
      </Button>
    </form>
  );
}
