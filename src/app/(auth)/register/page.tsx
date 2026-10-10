import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/_actions/auth";
import { safeNext } from "@/app/_shared/safe-next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Create account - GestTask" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getContainer().session.getActor()) redirect(next);
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <CredentialsForm mode="sign-up" action={signUpAction} next={next} />
      <p className="text-sm">
        Already registered? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </main>
  );
}
