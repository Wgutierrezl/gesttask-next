import { LayoutGrid, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CountsList } from "@/components/dashboard/counts-list";
import { SectionTitle } from "@/components/dashboard/section-title";
import { StatIcon } from "@/components/dashboard/stat-card";
import { PageHero } from "@/components/ui/page-hero";
import { getContainer } from "@/infrastructure/container";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("dashboard") };
}

export default async function DashboardPage() {
  await requirePageActor();
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const { boards, assigned } = await loadPage(() => getContainer().useCases.getUserDashboard(undefined));
  return (
    <main className="flex flex-col gap-10">
      <PageHero title={t("title")} description={t("description")} />
      <section aria-labelledby="boards-stat">
        <div className="flex max-w-sm items-center gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <StatIcon icon={<LayoutGrid />} tone="violet" />
          <div className="flex flex-col">
            <Link href="/boards" className="text-3xl text-stat-violet underline underline-offset-4">{format.number(boards)}</Link>
            <h2 id="boards-stat" className="text-sm text-fg-muted">{t("boardsYouAreOn")}</h2>
          </div>
        </div>
      </section>
      <section aria-labelledby="assigned-heading" className="flex flex-col gap-4">
        <SectionTitle id="assigned-heading" icon={<TrendingUp />}>{t("assigned")}</SectionTitle>
        {assigned.total === 0 ? <p className="text-sm text-fg-muted">{t("nothingAssigned")}</p> : null}
        <CountsList label={t("assigned")} counts={assigned} />
      </section>
    </main>
  );
}
