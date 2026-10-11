import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInEmailAction } from "@/app/_actions/auth";
import { safeNext } from "@/app/_shared/safe-next";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { GuestButton } from "@/components/auth/guest-button";
import { AuthShell } from "@/components/shell/auth-shell";
import { getContainer } from "@/infrastructure/container";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("signIn") };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const t = await getTranslations("auth");
  const next = safeNext((await searchParams).next);
  // Guests still see the form: signing in or up from a guest session upgrades it (the sandbox moves along).
  const actor = await getContainer().session.getActor();
  if (actor && !actor.isGuest) redirect(next);
  return (
    <AuthShell title={t("signInTitle")}>
      <CredentialsForm mode="sign-in" action={signInEmailAction} next={next} />
      <p className="text-sm">
        {t("noAccount")} <Link href="/register" className="font-medium text-brand-link underline">{t("createOne")}</Link>
      </p>
      <hr className="border-border" />
      <GuestButton variant="secondary" />
    </AuthShell>
  );
}
