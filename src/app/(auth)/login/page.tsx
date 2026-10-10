import Link from "next/link";
import { redirect } from "next/navigation";
import { signInEmailAction } from "@/app/_actions/auth";
import { safeNext } from "@/app/_shared/safe-next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { GuestButton } from "@/components/auth/guest-button";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Sign in - GestTask" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getContainer().session.getActor()) redirect(next);
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <CredentialsForm mode="sign-in" action={signInEmailAction} next={next} />
      <p className="text-sm">
        No account? <Link href="/register" className="underline">Create one</Link>
      </p>
      <hr />
      <GuestButton />
    </main>
  );
}
