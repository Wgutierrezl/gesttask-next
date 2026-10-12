import { ArrowLeft, LayoutGrid, TrendingUp, Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CountsList } from "@/components/dashboard/counts-list";
import { PipelineStats } from "@/components/dashboard/pipeline-stats";
import { SectionTitle } from "@/components/dashboard/section-title";
import { getContainer } from "@/infrastructure/container";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("boardDashboard") };
}

export default async function BoardDashboardPage({ params }: { params: Promise<{ boardId: string }> }) {
  await requirePageActor();
  const t = await getTranslations("dashboard");
  const { boardId } = await params;
  const { board, dashboard } = await loadPage(async () => {
    const { getBoard, getBoardDashboard } = getContainer().useCases;
    // `getBoard` goes first: it is the authorization check, and a foreign board must not trigger the other read.
    const { board } = await getBoard({ boardId });
    return { board, dashboard: await getBoardDashboard({ boardId }) };
  });
  return (
    <main className="flex flex-col gap-10">
      <header className="flex items-center gap-4">
        <Link href={`/boards/${board.id}`} aria-label={t("back")} title={t("back")} className="rounded-xl p-2 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-gradient shadow-brand">
          <LayoutGrid className="size-6 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl text-fg">{board.name}</h1>
          <p className="text-sm text-fg-muted">{t("members", { count: dashboard.members })}</p>
        </div>
      </header>
      <section aria-labelledby="tasks-heading" className="flex flex-col gap-4">
        <SectionTitle id="tasks-heading" icon={<TrendingUp />}>{t("tasksOnBoard")}</SectionTitle>
        <CountsList label={t("tasksOnBoard")} counts={dashboard.tasks} />
      </section>
      <section aria-labelledby="pipelines-heading" className="flex flex-col gap-6">
        <SectionTitle id="pipelines-heading" icon={<Workflow />}>{t("byPipeline")}</SectionTitle>
        {dashboard.pipelines.length === 0 ? <p className="text-sm text-fg-muted">{t("noPipelines")}</p> : null}
        {dashboard.pipelines.map((pipeline) => (
          <PipelineStats key={pipeline.id} pipeline={pipeline} boardId={board.id} />
        ))}
      </section>
    </main>
  );
}
