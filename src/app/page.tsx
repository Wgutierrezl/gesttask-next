import { Columns3, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { GuestButton } from "@/components/auth/guest-button";
import { GridMask } from "@/components/shell/grid-mask";
import { PreferencesMenu } from "@/components/shell/preferences-menu";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

const FEATURES = [
  { Icon: Columns3, key: "pipelines" },
  { Icon: Users, key: "teams" },
  { Icon: ShieldCheck, key: "sandbox" },
] as const;

export default function HomePage() {
  const t = useTranslations("landing");
  return (
    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to">
        <GridMask />
        <PreferencesMenu floating />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center sm:py-32">
          <h1 className="text-4xl font-bold sm:text-5xl">
            <Logo markClassName="size-12 sm:size-16" wordmarkClassName="font-bold" />
          </h1>
          <p className="text-lg text-fg-strong">{t("tagline")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/login" variant="secondary">{t("signIn")}</LinkButton>
            <LinkButton href="/register" variant="secondary">{t("createAccount")}</LinkButton>
          </div>
          <GuestButton />
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center text-2xl font-semibold text-fg">{t("featuresHeading")}</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ Icon, key }) => (
            <li key={key}>
              <Card className="h-full">
                <CardBody className="flex flex-col gap-2">
                  <Icon aria-hidden="true" className="size-6 text-accent" />
                  <h3 className="font-semibold text-fg">{t(`features.${key}.title`)}</h3>
                  <p className="text-sm text-fg-muted">{t(`features.${key}.text`)}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
