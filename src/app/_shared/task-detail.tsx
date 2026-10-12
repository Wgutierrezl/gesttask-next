import { LIST_LOAD_CAP, loadAssigneeNames, loadCapped, toPipelineOptions } from "@/app/_shared/kanban-data";
import { toCommentRow } from "@/app/_shared/comments-data";
import { loadPage } from "@/app/_shared/load-page";
import { CommentsSection } from "@/components/comments/comments-section";
import { LocalTime } from "@/components/kanban/local-time";
import { MoveTaskForm } from "@/components/kanban/move-task-form";
import { formatDate } from "@/components/kanban/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/field";
import { getContainer } from "@/infrastructure/container";
import { useLocale, useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/config";

export interface TaskRouteParams {
  boardId: string;
  pipelineId: string;
  taskId: string;
}

/**
 * Everything the task page and the task modal show, loaded once with the access checks both need. The caller passes
 * the actor it got from `requirePageActor()`: every page makes that call itself, so the guard stays visible in it.
 */
export async function loadTaskDetail({ boardId, pipelineId, taskId }: TaskRouteParams, actor: { isGuest: boolean }) {
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
  const members = data.members.items.map(({ userId, name }) => ({ userId, name }));
  const assignee = task.assigneeId ? (data.assignee.get(task.assigneeId) ?? null) : null;
  if (task.assigneeId && assignee && !members.some((m) => m.userId === task.assigneeId)) members.push({ userId: task.assigneeId, name: assignee });
  return {
    actor,
    task,
    pipeline: data.pipeline,
    pipelines: data.pipelines,
    stages: data.stages.items,
    stagesTruncated: data.stages.truncated,
    comments: data.comments,
    members,
    assignee,
    stage: data.stages.items.find((s) => s.id === task.stageId),
    canWrite: role !== "guest",
  };
}

export type TaskDetail = Awaited<ReturnType<typeof loadTaskDetail>>;

/** Heading level of the sections: the page nests them under its h1, the modal under the dialog's h2. */
type Level = 2 | 3;
const Heading = ({ level, children, className = "mb-3 text-lg font-semibold text-fg" }: { level: Level; children: string; className?: string }) =>
  level === 2 ? <h2 className={className}>{children}</h2> : <h3 className={className}>{children}</h3>;

export function TaskDescription({ description }: { description: string }) {
  if (!description) return null;
  return <Card><CardBody><p className="whitespace-pre-wrap break-words text-sm text-fg-secondary">{description}</p></CardBody></Card>;
}

export function TaskDetailsCard({ detail, level }: { detail: TaskDetail; level: Level }) {
  const { task, stage, assignee } = detail;
  const locale = useLocale() as Locale;
  const t = useTranslations("task.detail");
  const k = useTranslations("kanban");
  return (
    <Card>
      <CardBody>
        <Heading level={level}>{t("details")}</Heading>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-fg-strong">{k("fields.stage")}</dt>
          <dd className="flex flex-wrap items-center gap-1">
            <Badge tone="brand">{stage?.name ?? t("unknownStage")}</Badge>
            {stage?.isDone ? <Badge tone="success">{k("doneStage")}</Badge> : null}
          </dd>
          <dt className="font-medium text-fg-strong">{k("fields.priority")}</dt>
          <dd><Badge tone={priorityTone(task.priority)}>{k(`priority.${task.priority}`)}</Badge></dd>
          <dt className="font-medium text-fg-strong">{k("fields.assignee")}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            {assignee ? <Avatar name={assignee} size="sm" /> : null}
            <span className="min-w-0 truncate">{task.assigneeId === null ? k("unassigned") : (assignee ?? k("formerMember"))}</span>
          </dd>
          <dt className="font-medium text-fg-strong">{k("fields.dueDate")}</dt>
          <dd>
            {task.dueDate ? k("due", { date: formatDate(task.dueDate, locale) }) : t("noDueDate")}
            {task.overdue ? <span className="ml-2"><Badge tone="danger">{k("overdue")}</Badge></span> : null}
          </dd>
          {task.completedAt ? (
            <>
              <dt className="font-medium text-fg-strong">{k("completed")}</dt>
              <dd><LocalTime iso={task.completedAt.toISOString()} label={k("completed")} /></dd>
            </>
          ) : null}
          <dt className="font-medium text-fg-strong">{t("created")}</dt>
          <dd>{formatDate(task.createdAt.toISOString(), locale)}</dd>
        </dl>
      </CardBody>
    </Card>
  );
}

/** Writers only. Level 3 is the modal (its sections nest under the dialog title), which also changes where a cross-pipeline move lands. */
export function TaskMoveCard({ detail, level }: { detail: TaskDetail; level: Level }) {
  const { task, pipeline, pipelines, stages } = detail;
  const t = useTranslations("task.move");
  return (
    <div>
      <Heading level={level}>{t("heading")}</Heading>
      <Card>
        <CardBody>
          <MoveTaskForm inModal={level === 3} taskId={task.id} pipelineId={pipeline.id} pipelineName={pipeline.name} stages={stages.map(({ id, name }) => ({ id, name }))} currentStageId={task.stageId} otherPipelines={pipelines.filter((p) => p.id !== pipeline.id)} />
        </CardBody>
      </Card>
    </div>
  );
}

export function TaskComments({ detail }: { detail: TaskDetail }) {
  const { task, comments, canWrite, actor } = detail;
  return <CommentsSection taskId={task.id} comments={comments.items.map(toCommentRow)} truncated={comments.truncated} loadCap={LIST_LOAD_CAP} canAttach={canWrite} demoGuest={actor.isGuest} />;
}

export function StagesTruncatedNotice({ detail }: { detail: TaskDetail }) {
  const t = useTranslations("kanban.page");
  return detail.stagesTruncated ? <Alert tone="warning">{t("truncatedStages", { count: LIST_LOAD_CAP })}</Alert> : null;
}
