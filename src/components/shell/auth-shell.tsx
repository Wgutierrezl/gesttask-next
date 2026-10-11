import type { ReactNode } from "react";
import { GridMask } from "./grid-mask";
import { PreferencesMenu } from "./preferences-menu";
import { Card, CardBody } from "@/components/ui/card";

/** Shared frame of the sign-in and sign-up pages: a centred card over the brand gradient and a faded grid. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-12">
      <GridMask />
      <PreferencesMenu floating />
      <Card className="relative w-full max-w-sm animate-pop-in">
        <CardBody className="flex flex-col gap-6 p-6">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {children}
        </CardBody>
      </Card>
    </main>
  );
}
