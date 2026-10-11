import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CountsList } from "@/components/dashboard/counts-list";
import { PipelineStats } from "@/components/dashboard/pipeline-stats";
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
    <main className="flex flex-col gap-6">
      <header>
        <Link href={`/boards/${board.id}`} className="text-sm font-medium text-brand-700 underline">{t("back")}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{board.name}</h1>
        <p className="text-sm text-slate-600">{t("members", { count: dashboard.members })}</p>
      </header>
      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <h2 id="tasks-heading" className="text-lg font-semibold text-slate-900">{t("tasksOnBoard")}</h2>
        <CountsList label={t("tasksOnBoard")} counts={dashboard.tasks} />
      </section>
      <section aria-labelledby="pipelines-heading" className="flex flex-col gap-6">
        <h2 id="pipelines-heading" className="text-lg font-semibold text-slate-900">{t("byPipeline")}</h2>
        {dashboard.pipelines.length === 0 ? <p className="text-sm text-slate-600">{t("noPipelines")}</p> : null}
        {dashboard.pipelines.map((pipeline) => (
          <PipelineStats key={pipeline.id} pipeline={pipeline} boardId={board.id} />
        ))}
      </section>
    </main>
  );
}
