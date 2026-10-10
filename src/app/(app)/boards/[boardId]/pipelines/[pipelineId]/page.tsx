import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadPage } from "@/app/_shared/load-page";
import { LIST_LOAD_CAP, loadAssigneeNames, loadCapped, toStageView, toTaskCardView } from "@/app/_shared/kanban-data";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { buildColumns } from "@/components/kanban/columns";
import { CreateTaskForm } from "@/components/kanban/create-task-form";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { StageManager } from "@/components/kanban/stage-manager";
import { getContainer } from "@/infrastructure/container";

function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded bg-yellow-50 px-3 py-2 text-sm">{children}</p>;
}

export const metadata = { title: "Pipeline - GestTask" };

interface PipelinePageProps {
  params: Promise<{ boardId: string; pipelineId: string }>;
}

export default async function PipelinePage({ params }: PipelinePageProps) {
  await requirePageActor();
  const { boardId, pipelineId } = await params;
  const data = await loadPage(async () => {
    const { getPipeline, listStages, listTasksByPipeline, listMemberProfiles } = getContainer().useCases;
    // `getPipeline` goes first: it is the authorization check, and a foreign pipeline must not trigger the other reads.
    const detail = await getPipeline({ pipelineId });
    if (detail.pipeline.boardId !== boardId) return null;
    const [stages, loaded, members] = await Promise.all([
      loadCapped((page) => listStages({ pipelineId, ...page }), LIST_LOAD_CAP),
      loadCapped((page) => listTasksByPipeline({ pipelineId, ...page })),
      loadCapped((page) => listMemberProfiles({ boardId, ...page }), LIST_LOAD_CAP),
    ]);
    // Names come from a lookup by id for the tasks on screen, so they do not depend on the capped member list.
    const names = await loadAssigneeNames((userIds) => listMemberProfiles({ boardId, userIds }), loaded.items.map((task) => task.assigneeId));
    return { ...detail, stages, loaded, members, names };
  });
  // A pipeline reached through the wrong board in the URL is indistinguishable from a missing one.
  if (!data) notFound();
  // Viewers (the guest role) read only; the use cases enforce this too, the UI just does not offer what would fail.
  const canWrite = data.role !== "guest";
  const columns = buildColumns(data.stages.items.map(toStageView), data.loaded.items.map(toTaskCardView));
  return (
    <main className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={`/boards/${boardId}`} className="underline">Back to board</Link>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold">{data.pipeline.name}</h1>
        {data.pipeline.description ? <p className="text-sm text-gray-600">{data.pipeline.description}</p> : null}
      </header>
      {data.loaded.truncated ? <Notice>Showing the first 1000 tasks of this pipeline.</Notice> : null}
      {data.stages.truncated ? <Notice>Showing the first {LIST_LOAD_CAP} stages of this pipeline.</Notice> : null}
      {data.members.truncated ? <Notice>Showing the first {LIST_LOAD_CAP} members to choose as assignee.</Notice> : null}
      {canWrite ? (
        <details className="rounded border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Add a task</summary>
          <div className="mt-3">
            <CreateTaskForm stages={columns.map(({ stage }) => ({ id: stage.id, name: stage.name }))} members={data.members.items.map(({ userId, name }) => ({ userId, name }))} />
          </div>
        </details>
      ) : null}
      <KanbanBoard columns={columns} canWrite={canWrite} names={Object.fromEntries(data.names)} taskBase={`/boards/${boardId}/pipelines/${pipelineId}/tasks/`} />
      {data.role === "owner" ? (
        <StageManager pipelineId={pipelineId} truncated={data.loaded.truncated} stages={columns.map(({ stage, tasks }) => ({ ...stage, taskCount: tasks.length }))} />
      ) : null}
    </main>
  );
}
