import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CountsList } from "@/components/dashboard/counts-list";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Dashboard - GestTask" };

export default async function DashboardPage() {
  await requirePageActor();
  const { boards, assigned } = await loadPage(() => getContainer().useCases.getUserDashboard(undefined));
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Your dashboard</h1>
      <section aria-labelledby="boards-stat" className="flex items-baseline gap-3">
        <h2 id="boards-stat" className="text-sm text-gray-600">Boards you are on</h2>
        <Link href="/boards" className="text-2xl font-semibold underline">{boards}</Link>
      </section>
      <section aria-labelledby="assigned-heading" className="flex flex-col gap-3">
        <h2 id="assigned-heading" className="text-lg font-medium">Assigned to you</h2>
        {assigned.total === 0 ? <p className="text-sm text-gray-600">Nothing is assigned to you yet.</p> : null}
        <CountsList label="Assigned to you" counts={assigned} />
      </section>
    </main>
  );
}
