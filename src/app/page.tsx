import { Columns3, ShieldCheck, Users } from "lucide-react";
import { GuestButton } from "@/components/auth/guest-button";
import { GridMask } from "@/components/shell/grid-mask";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

const FEATURES = [
  { Icon: Columns3, title: "Flexible pipelines", text: "Shape your workflow with stages that fit how your team really works." },
  { Icon: Users, title: "Built for teams", text: "Invite members with owner, editor and viewer roles on every board." },
  { Icon: ShieldCheck, title: "Safe to explore", text: "Try a ready-made sandbox board in one click, no account needed." },
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100">
        <GridMask />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-24 text-center sm:py-32">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            GestTask
          </h1>
          <p className="text-lg text-slate-700">Kanban boards for small teams.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
            <LinkButton href="/register" variant="secondary">Create account</LinkButton>
          </div>
          <GuestButton />
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center text-2xl font-semibold text-slate-900">Everything you need to ship together</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title}>
              <Card className="h-full">
                <CardBody className="flex flex-col gap-2">
                  <Icon aria-hidden="true" className="size-6 text-brand-600" />
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm text-slate-600">{text}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
