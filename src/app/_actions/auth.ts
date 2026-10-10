"use server";

import { redirect } from "next/navigation";
import type { ActionFailure } from "@/application/result";
import { runAction } from "@/application/to-action-result";
import { getContainer } from "@/infrastructure/container";
import { safeNext } from "../_shared/safe-next";

/** What `useActionState` holds: nothing yet, or the failure to show. Success never returns: it redirects. */
export type FormState = ActionFailure | undefined;

async function run(work: () => Promise<unknown>, destination: string): Promise<FormState> {
  const { logger } = getContainer();
  const result = await runAction(work, (error) => logger.error("auth action failed", { error }));
  if (!result.ok) return result;
  redirect(destination);
}

export async function signInEmailAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(
    () => getContainer().auth.signInEmail({ email: form.get("email"), password: form.get("password") }),
    safeNext(form.get("next")),
  );
}

export async function signUpAction(_previous: FormState, form: FormData): Promise<FormState> {
  return run(
    () => getContainer().auth.signUp({ email: form.get("email"), password: form.get("password"), name: form.get("name") }),
    safeNext(form.get("next")),
  );
}

export async function signInGuestAction(): Promise<FormState> {
  return run(() => getContainer().auth.signInGuest(), "/boards");
}

export async function signOutAction(): Promise<void> {
  await getContainer().auth.signOut();
  redirect("/login");
}
