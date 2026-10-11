import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { GridMask } from "./grid-mask";
import { PreferencesMenu } from "./preferences-menu";
import { Card, CardBody } from "@/components/ui/card";

/** Shared frame of the sign-in and sign-up pages: a centred card over the brand gradient and a faded grid. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to px-4 py-12">
      <GridMask />
      <PreferencesMenu floating />
      <Card className="relative w-full max-w-sm animate-pop-in">
        <CardBody className="flex flex-col gap-6 p-6">
          <Logo markClassName="size-9" wordmarkClassName="text-lg" />
          <h1 className="text-2xl font-semibold text-fg">{title}</h1>
          {children}
        </CardBody>
      </Card>
    </main>
  );
}
