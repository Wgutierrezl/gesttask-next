import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/_actions/auth";
import { safeNext } from "@/app/_shared/safe-next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { AuthShell } from "@/components/shell/auth-shell";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Create account - GestTask" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  // Guests still see the form: signing in or up from a guest session upgrades it (the sandbox moves along).
  const actor = await getContainer().session.getActor();
  if (actor && !actor.isGuest) redirect(next);
  return (
    <AuthShell title="Create your account">
      <CredentialsForm mode="sign-up" action={signUpAction} next={next} />
      <p className="text-sm">
        Already registered? <Link href="/login" className="font-medium text-brand-700 underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
