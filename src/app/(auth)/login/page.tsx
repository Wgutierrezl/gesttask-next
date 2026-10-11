import Link from "next/link";
import { redirect } from "next/navigation";
import { signInEmailAction } from "@/app/_actions/auth";
import { safeNext } from "@/app/_shared/safe-next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { GuestButton } from "@/components/auth/guest-button";
import { AuthShell } from "@/components/shell/auth-shell";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Sign in - GestTask" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  // Guests still see the form: signing in or up from a guest session upgrades it (the sandbox moves along).
  const actor = await getContainer().session.getActor();
  if (actor && !actor.isGuest) redirect(next);
  return (
    <AuthShell title="Sign in">
      <CredentialsForm mode="sign-in" action={signInEmailAction} next={next} />
      <p className="text-sm">
        No account? <Link href="/register" className="font-medium text-brand-700 underline">Create one</Link>
      </p>
      <hr className="border-slate-200" />
      <GuestButton variant="secondary" />
    </AuthShell>
  );
}
