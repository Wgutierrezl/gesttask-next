import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadPage } from "@/app/_shared/load-page";
import { LIST_LOAD_CAP, loadAssigneeNames, loadCapped, toPipelineOptions, toStageView, toTaskCardView } from "@/app/_shared/kanban-data";
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

export const metadata = { title: "Pipeline" };

interface PipelinePageProps {
  params: Promise<{ boardId: string; pipelineId: string }>;
}

export default async function PipelinePage({ params }: PipelinePageProps) {
  await requirePageActor();
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
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={`/boards/${boardId}`} className="inline-flex items-center gap-1 text-slate-600 hover:text-brand-700 hover:underline"><ChevronLeft aria-hidden="true" className="size-4" />Back to board</Link>
      </nav>
      <PageHeader title={data.pipeline.name} description={data.pipeline.description || undefined} />
      {data.loaded.truncated ? <Notice>Showing the first 1000 tasks of this pipeline.</Notice> : null}
      {data.stages.truncated ? <Notice>Showing the first {LIST_LOAD_CAP} stages of this pipeline.</Notice> : null}
      {data.members.truncated ? <Notice>Showing the first {LIST_LOAD_CAP} members to choose as assignee.</Notice> : null}
      {canWrite && columns.length === 0 ? <Notice>Add a stage first: tasks live inside stages.</Notice> : null}
      <KanbanBoard columns={columns} canWrite={canWrite} names={Object.fromEntries(data.names)} taskBase={`/boards/${boardId}/pipelines/${pipelineId}/tasks/`} switcher={{ boardId, pipelineId, pipelines: data.pipelines }} members={canWrite ? data.members.items.map(({ userId, name }) => ({ userId, name })) : undefined} />
      {data.role === "owner" ? (
        <StageManager pipelineId={pipelineId} truncated={data.loaded.truncated} stages={columns.map(({ stage, tasks }) => ({ ...stage, taskCount: tasks.length }))} />
      ) : null}
    </main>
  );
}
