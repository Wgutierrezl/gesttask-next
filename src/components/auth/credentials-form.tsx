"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/application/auth-policy";
import type { FormState } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "./form-error";

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
      {signUp ? (
        <Field label="Name" required error={fields?.name?.join(" ")}>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
      ) : null}
      <Field label="Email" required error={fields?.email?.join(" ")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" required error={fields?.password?.join(" ")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
          required
        />
      </Field>
      <FormError failure={state} inlineFields={signUp ? ["name", "email", "password"] : ["email", "password"]} />
      <Button type="submit" disabled={pending}>
        {pending ? COPY[mode].pending : COPY[mode].submit}
      </Button>
    </form>
  );
}
