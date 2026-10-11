import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CountsList } from "@/components/dashboard/counts-list";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requirePageActor();
  const { boards, assigned } = await loadPage(() => getContainer().useCases.getUserDashboard(undefined));
  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Your dashboard" description="A summary of your boards and the work assigned to you." />
      <section aria-labelledby="boards-stat">
        <Card className="flex items-baseline justify-between gap-3 p-5">
          <h2 id="boards-stat" className="text-sm font-medium text-slate-600">Boards you are on</h2>
          <Link href="/boards" className="text-3xl font-semibold tracking-tight text-brand-700 underline">{boards}</Link>
        </Card>
      </section>
      <section aria-labelledby="assigned-heading" className="flex flex-col gap-3">
        <h2 id="assigned-heading" className="text-lg font-semibold text-slate-900">Assigned to you</h2>
        {assigned.total === 0 ? <p className="text-sm text-slate-600">Nothing is assigned to you yet.</p> : null}
        <CountsList label="Assigned to you" counts={assigned} />
      </section>
    </main>
  );
}
