import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LIST_LOAD_CAP, loadAssigneeNames, loadCapped, toPipelineOptions } from "@/app/_shared/kanban-data";
import { toCommentRow } from "@/app/_shared/comments-data";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { CommentsSection } from "@/components/comments/comments-section";
import { DeleteTaskForm } from "@/components/kanban/delete-task-form";
import { MoveTaskForm } from "@/components/kanban/move-task-form";
import { LocalTime } from "@/components/kanban/local-time";
import { EditTaskForm } from "@/components/kanban/edit-task-form";
import { assigneeLabel, formatDate, PRIORITY_LABELS } from "@/components/kanban/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Task - GestTask" };

interface TaskPageProps {
  params: Promise<{ boardId: string; pipelineId: string; taskId: string }>;
}

export default async function TaskPage({ params }: TaskPageProps) {
  const actor = await requirePageActor();
  const { boardId, pipelineId, taskId } = await params;
  const data = await loadPage(async () => {
    const { getTask, getPipeline, listStages, listMemberProfiles, listComments, getBoardDashboard } = getContainer().useCases;
    // `getTask` goes first: it is the authorization check, and a foreign task must not trigger the other reads.
    const task = await getTask({ taskId });
    if (task.boardId !== boardId || task.pipelineId !== pipelineId) return null;
    const [{ role, pipeline, pipelines }, stages, members, assignee, comments] = await Promise.all([
      // The board's pipelines are only for the Move form, which viewers do not get: they skip that read.
      getPipeline({ pipelineId }).then(async (detail) => ({
        ...detail,
        pipelines: detail.role === "guest" ? [] : toPipelineOptions((await getBoardDashboard({ boardId })).pipelines),
      })),
      loadCapped((page) => listStages({ pipelineId, ...page }), LIST_LOAD_CAP),
      loadCapped((page) => listMemberProfiles({ boardId, ...page }), LIST_LOAD_CAP),
      // The assignee is looked up by id: a member beyond the capped list is still named and stays selected when editing.
      loadAssigneeNames((userIds) => listMemberProfiles({ boardId, userIds }), [task.assigneeId]),
      loadCapped((page) => listComments({ taskId, ...page }), LIST_LOAD_CAP),
    ]);
    return { task, role, pipeline, stages, members, assignee, comments, pipelines };
  });
  // A task reached through the wrong board or pipeline in the URL is indistinguishable from a missing one.
  if (!data) notFound();
  const { task, role } = data;
  const stages = data.stages.items;
  const members = data.members.items.map(({ userId, name }) => ({ userId, name }));
  const assignee = task.assigneeId ? (data.assignee.get(task.assigneeId) ?? null) : null;
  if (task.assigneeId && assignee && !members.some((m) => m.userId === task.assigneeId)) members.push({ userId: task.assigneeId, name: assignee });
  const stage = stages.find((s) => s.id === task.stageId);
  const canWrite = role !== "guest";
  return (
    <main className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={`/boards/${boardId}/pipelines/${pipelineId}`} className="inline-flex items-center gap-1 rounded text-slate-600 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"><ChevronLeft aria-hidden="true" className="size-4" />Back to pipeline</Link>
      </nav>
      <PageHeader title={task.title} />
      {data.stages.truncated ? <Alert tone="warning">Showing the first {LIST_LOAD_CAP} stages of this pipeline.</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {task.description ? <Card><CardBody><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{task.description}</p></CardBody></Card> : null}
          <CommentsSection taskId={task.id} comments={data.comments.items.map(toCommentRow)} truncated={data.comments.truncated} canAttach={canWrite} demoGuest={actor.isGuest} />
          {canWrite ? (
            <div>
              <h2 id="edit-heading" className="mb-3 text-lg font-semibold text-slate-900">Edit task</h2>
              <Card><CardBody><EditTaskForm task={task} members={members} /></CardBody></Card>
            </div>
          ) : null}
        </div>
        <aside aria-label="Task details" className="flex flex-col gap-6">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Details</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-slate-700">Stage</dt>
                <dd className="flex flex-wrap items-center gap-1">
                  <Badge tone="brand">{stage?.name ?? "Unknown stage"}</Badge>
                  {stage?.isDone ? <Badge tone="success">Done stage</Badge> : null}
                </dd>
                <dt className="font-medium text-slate-700">Priority</dt>
                <dd><Badge tone={priorityTone(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge></dd>
                <dt className="font-medium text-slate-700">Assignee</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {assignee ? <Avatar name={assignee} size="sm" /> : null}
                  <span className="min-w-0 truncate">{assigneeLabel(task.assigneeId, assignee)}</span>
                </dd>
                <dt className="font-medium text-slate-700">Due date</dt>
                <dd>
                  {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}
                  {task.overdue ? <span className="ml-2"><Badge tone="danger">Overdue</Badge></span> : null}
                </dd>
                {task.completedAt ? (
                  <>
                    <dt className="font-medium text-slate-700">Completed</dt>
                    <dd><LocalTime iso={task.completedAt.toISOString()} label="Completed" /></dd>
                  </>
                ) : null}
                <dt className="font-medium text-slate-700">Created</dt>
                <dd>{formatDate(task.createdAt.toISOString())}</dd>
              </dl>
            </CardBody>
          </Card>
          {canWrite ? (
            <>
              <div>
                <h2 id="move-heading" className="mb-3 text-lg font-semibold text-slate-900">Move task</h2>
                <Card><CardBody><MoveTaskForm taskId={task.id} pipelineId={pipelineId} pipelineName={data.pipeline.name} stages={stages.map(({ id, name }) => ({ id, name }))} currentStageId={task.stageId} otherPipelines={data.pipelines.filter((p) => p.id !== pipelineId)} /></CardBody></Card>
              </div>
              <div>
                <h2 id="delete-heading" className="mb-3 text-lg font-semibold text-slate-900">Delete task</h2>
                <Card><CardBody><DeleteTaskForm taskId={task.id} /></CardBody></Card>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
