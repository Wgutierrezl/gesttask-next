import type { ReactNode } from "react";
import { Card, CardBody } from "@/components/ui/card";

/** Shared frame of the sign-in and sign-up pages: a centred card over the brand gradient and a faded grid. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-12">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,rgb(15_23_42/6%)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/6%)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <Card className="relative w-full max-w-sm animate-pop-in">
        <CardBody className="flex flex-col gap-6 p-6">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {children}
        </CardBody>
      </Card>
    </main>
  );
}
