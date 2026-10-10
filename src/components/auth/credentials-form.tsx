"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/_actions/auth";
import { FormError } from "./form-error";
import { FormField } from "./form-field";

interface CredentialsFormProps {
  mode: "sign-in" | "sign-up";
  action: (previous: FormState, form: FormData) => Promise<FormState>;
  /** Where to go after success; validated again on the server. */
  next?: string;
}

const COPY = {
  "sign-in": { submit: "Sign in", pending: "Signing in..." },
  "sign-up": { submit: "Create account", pending: "Creating account..." },
} as const;

export function CredentialsForm({ mode, action, next }: CredentialsFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const fields = state && !state.ok ? state.fieldErrors : undefined;
  const signUp = mode === "sign-up";
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {signUp ? <FormField label="Name" name="name" autoComplete="name" errors={fields?.name} /> : null}
      <FormField label="Email" name="email" type="email" autoComplete="email" errors={fields?.email} />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete={signUp ? "new-password" : "current-password"}
        minLength={signUp ? 8 : undefined}
        errors={fields?.password}
      />
      <FormError failure={state} />
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? COPY[mode].pending : COPY[mode].submit}
      </button>
    </form>
  );
}
