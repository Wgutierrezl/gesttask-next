"use client";

import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/application/auth-policy";
import type { FormState } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "./form-error";

/** v1's roomier inputs; `!` because the shared control already sets its own padding and radius. */
const ROOMY = "py-3.5! rounded-xl!";

interface CredentialsFormProps {
  mode: "sign-in" | "sign-up";
  action: (previous: FormState, form: FormData) => Promise<FormState>;
  /** Where to go after success; validated again on the server. */
  next?: string;
}

export function CredentialsForm({ mode, action, next }: CredentialsFormProps) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, undefined);
  const fields = state && !state.ok ? state.fieldErrors : undefined;
  const signUp = mode === "sign-up";
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {signUp ? (
        <Field label={t("name")} required icon={<User />} error={fields?.name?.join(" ")}>
          <Input className={ROOMY} name="name" autoComplete="name" placeholder={t("namePlaceholder")} required />
        </Field>
      ) : null}
      <Field label={t("email")} required icon={<Mail />} error={fields?.email?.join(" ")}>
        <Input className={ROOMY} name="email" type="email" autoComplete="email" placeholder={t("emailPlaceholder")} required />
      </Field>
      <Field label={t("password")} required icon={<Lock />} error={fields?.password?.join(" ")}>
        <Input
          className={ROOMY}
          name="password"
          placeholder={t("passwordPlaceholder")}
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
          required
        />
      </Field>
      <FormError failure={state} inlineFields={signUp ? ["name", "email", "password"] : ["email", "password"]} />
      <Button type="submit" disabled={pending} className="group h-12 rounded-xl">
        {signUp ? (pending ? t("signUpPending") : t("signUpSubmit")) : pending ? t("signInPending") : t("signInSubmit")}
        <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
      </Button>
    </form>
  );
}
