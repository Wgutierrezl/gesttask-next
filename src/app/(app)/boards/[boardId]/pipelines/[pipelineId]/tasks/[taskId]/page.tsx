import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPage } from "@/app/_shared/load-page";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { DeleteTaskForm } from "@/components/kanban/delete-task-form";
import { MoveTaskForm } from "@/components/kanban/move-task-form";
import { EditTaskForm } from "@/components/kanban/edit-task-form";
import { assigneeLabel, formatDate, PRIORITY_LABELS } from "@/components/kanban/format";
import { getContainer } from "@/infrastructure/container";

export const metadata = { title: "Task - GestTask" };

interface TaskPageProps {
  params: Promise<{ boardId: string; pipelineId: string; taskId: string }>;
}

export default async function TaskPage({ params }: TaskPageProps) {
  await requirePageActor();
  const { boardId, pipelineId, taskId } = await params;
  const data = await loadPage(async () => {
    const { getTask, getPipeline, listStages, listMemberProfiles } = getContainer().useCases;
    // `getTask` goes first: it is the authorization check, and a foreign task must not trigger the other reads.
    const task = await getTask({ taskId });
    if (task.boardId !== boardId || task.pipelineId !== pipelineId) return null;
    const [{ role }, stages, members] = await Promise.all([
      getPipeline({ pipelineId }),
      listStages({ pipelineId, limit: 200 }),
      listMemberProfiles({ boardId, limit: 200 }),
    ]);
    return { task, role, stages, members };
  });
  // A task reached through the wrong board or pipeline in the URL is indistinguishable from a missing one.
  if (!data) notFound();
  const { task, role, stages } = data;
  const members = data.members.map(({ userId, name }) => ({ userId, name }));
  const stage = stages.find((s) => s.id === task.stageId);
  const assignee = members.find((m) => m.userId === task.assigneeId)?.name ?? null;
  const canWrite = role !== "guest";
  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={`/boards/${boardId}/pipelines/${pipelineId}`} className="underline">Back to pipeline</Link>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {stage?.name ?? "Unknown stage"}
          {stage?.isDone ? " (Done stage)" : ""}
        </p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium">Priority</dt>
        <dd>{PRIORITY_LABELS[task.priority]}</dd>
        <dt className="font-medium">Assignee</dt>
        <dd>{assigneeLabel(task.assigneeId, assignee)}</dd>
        <dt className="font-medium">Due date</dt>
        <dd>
          {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}
          {task.overdue ? <span className="ml-2 rounded bg-red-700 px-2 py-0.5 text-xs text-white">Overdue</span> : null}
        </dd>
        {task.completedAt ? (
          <>
            <dt className="font-medium">Completed</dt>
            <dd>{`Completed ${formatDate(task.completedAt.toISOString())}`}</dd>
          </>
        ) : null}
        <dt className="font-medium">Created</dt>
        <dd>{formatDate(task.createdAt.toISOString())}</dd>
      </dl>
      {task.description ? <p className="whitespace-pre-wrap text-sm">{task.description}</p> : null}
      {canWrite ? (
        <>
          <section aria-labelledby="move-heading">
            <h2 id="move-heading" className="mb-3 text-lg font-medium">Move task</h2>
            <MoveTaskForm taskId={task.id} stages={stages.map(({ id, name }) => ({ id, name }))} currentStageId={task.stageId} />
          </section>
          <section aria-labelledby="edit-heading">
            <h2 id="edit-heading" className="mb-3 text-lg font-medium">Edit task</h2>
            <EditTaskForm task={task} members={members} />
          </section>
          <section aria-labelledby="delete-heading">
            <h2 id="delete-heading" className="mb-3 text-lg font-medium">Delete task</h2>
            <DeleteTaskForm taskId={task.id} />
          </section>
        </>
      ) : null}
    </main>
  );
}
