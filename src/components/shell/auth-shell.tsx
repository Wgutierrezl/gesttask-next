import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { GridMask } from "./grid-mask";
import { PreferencesMenu } from "./preferences-menu";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Shared frame of the sign-in and sign-up pages, like v1's: the brand block (mark, wordmark, subtitle) above a centred
 * card, over the brand gradient and a faded grid, with a short motto underneath. The card's title is the page's one h1.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTranslations("auth");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to px-4 py-12">
      <GridMask />
      <PreferencesMenu floating />
      <div className="relative w-full max-w-md animate-pop-in">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo stacked markClassName="size-16 rounded-2xl shadow-brand" wordmarkClassName="text-4xl font-normal" />
          {subtitle ? <p className="text-fg-muted">{subtitle}</p> : null}
        </div>
        <Card className="rounded-3xl">
          <CardBody className="flex flex-col gap-6 p-8">
            <h1 className="text-2xl text-fg">{title}</h1>
            {children}
          </CardBody>
        </Card>
        <p className="mt-8 text-center text-sm text-fg-subtle">{t("footerTagline")}</p>
      </div>
    </main>
  );
}
