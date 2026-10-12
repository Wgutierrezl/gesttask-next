import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { loadPage } from "@/app/_shared/load-page";
import { LIST_LOAD_CAP, TASK_LOAD_CAP, loadAssigneeNames, loadCapped, toPipelineOptions, toStageView, toTaskCardView } from "@/app/_shared/kanban-data";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { Alert } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { buildColumns } from "@/components/kanban/columns";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { StageManager } from "@/components/kanban/stage-manager";
import { getContainer } from "@/infrastructure/container";

function Notice({ children }: { children: ReactNode }) {
  return <Alert tone="warning">{children}</Alert>;
}

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("pipeline") };
}

interface PipelinePageProps {
  params: Promise<{ boardId: string; pipelineId: string }>;
}

export default async function PipelinePage({ params }: PipelinePageProps) {
  await requirePageActor();
  const [t, format] = [(await getTranslations("kanban")), await getFormatter()];
  // Plain digits in every language: "1000", not "1,000", so the notice reads as it always did.
  const count = (n: number) => format.number(n, { useGrouping: false });
  const { boardId, pipelineId } = await params;
  const data = await loadPage(async () => {
    const { getPipeline, listStages, listTasksByPipeline, listMemberProfiles, getBoardDashboard } = getContainer().useCases;
    // `getPipeline` goes first: it is the authorization check, and a foreign pipeline must not trigger the other reads.
    const detail = await getPipeline({ pipelineId });
    if (detail.pipeline.boardId !== boardId) return null;
    const [stages, loaded, members, dashboard] = await Promise.all([
      loadCapped((page) => listStages({ pipelineId, ...page }), LIST_LOAD_CAP),
      loadCapped((page) => listTasksByPipeline({ pipelineId, ...page })),
      loadCapped((page) => listMemberProfiles({ boardId, ...page }), LIST_LOAD_CAP),
      // The board's pipelines with their counts and stages: the tabs, and where a card can be moved to.
      getBoardDashboard({ boardId }),
    ]);
    // Names come from a lookup by id for the tasks on screen, so they do not depend on the capped member list.
    const names = await loadAssigneeNames((userIds) => listMemberProfiles({ boardId, userIds }), loaded.items.map((task) => task.assigneeId));
    return { ...detail, stages, loaded, members, names, pipelines: toPipelineOptions(dashboard.pipelines) };
  });
  // A pipeline reached through the wrong board in the URL is indistinguishable from a missing one.
  if (!data) notFound();
  // Viewers (the guest role) read only; the use cases enforce this too, the UI just does not offer what would fail.
  const canWrite = data.role !== "guest";
  const columns = buildColumns(data.stages.items.map(toStageView), data.loaded.items.map(toTaskCardView));
  return (
    <main className="flex flex-col gap-4">
      <nav aria-label={t("page.breadcrumb")} className="text-sm">
        <Link href={`/boards/${boardId}`} className="inline-flex items-center gap-1 text-fg-muted hover:text-brand-link hover:underline"><ChevronLeft aria-hidden="true" className="size-4" />{t("page.back")}</Link>
      </nav>
      <PageHeader title={data.pipeline.name} description={data.pipeline.description || undefined} />
      {data.loaded.truncated ? <Notice>{t("page.truncatedTasks", { count: count(TASK_LOAD_CAP) })}</Notice> : null}
      {data.stages.truncated ? <Notice>{t("page.truncatedStages", { count: count(LIST_LOAD_CAP) })}</Notice> : null}
      {data.members.truncated ? <Notice>{t("page.truncatedMembers", { count: count(LIST_LOAD_CAP) })}</Notice> : null}
      {canWrite && columns.length === 0 ? <Notice>{t("addStageFirst")}</Notice> : null}
      <KanbanBoard columns={columns} canWrite={canWrite} names={Object.fromEntries(data.names)} taskBase={`/boards/${boardId}/pipelines/${pipelineId}/tasks/`} switcher={{ boardId, pipelineId, pipelines: data.pipelines }} members={canWrite ? data.members.items.map(({ userId, name }) => ({ userId, name })) : undefined} />
      {data.role === "owner" ? (
        <StageManager pipelineId={pipelineId} truncated={data.loaded.truncated} stages={columns.map(({ stage, tasks }) => ({ ...stage, taskCount: tasks.length }))} />
      ) : null}
    </main>
  );
}
