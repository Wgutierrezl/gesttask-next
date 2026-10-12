import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { pipelinePath } from "@/app/_shared/paths";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { loadTaskDetail, StagesTruncatedNotice, TaskComments, TaskDescription, TaskDetailsCard, TaskMoveCard, type TaskRouteParams } from "@/app/_shared/task-detail";
import { TaskActions } from "@/components/kanban/task-actions";
import { RouteModal } from "@/components/ui/route-modal";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("task") };
}

interface TaskModalProps {
  params: Promise<TaskRouteParams>;
}

/** The task over the board. Intercepts client-side navigation to the task route; a reload renders the full page instead. */
export default async function TaskModalPage({ params }: TaskModalProps) {
  const actor = await requirePageActor();
  const detail = await loadTaskDetail(await params, actor);
  const t = await getTranslations("task.detail");
  const { task, pipeline, stage, members, canWrite } = detail;
  return (
    <RouteModal
      fallbackHref={pipelinePath(task.boardId, task.pipelineId)}
      title={task.title}
      subtitle={`${pipeline.name} → ${stage?.name ?? t("unknownStage")}`}
      icon={<ClipboardList className="size-5" />}
      actions={canWrite ? <TaskActions task={task} members={members} /> : undefined}
    >
      <StagesTruncatedNotice detail={detail} />
      <TaskDescription description={task.description} />
      <TaskDetailsCard detail={detail} level={3} />
      {canWrite ? <TaskMoveCard detail={detail} level={3} /> : null}
      <TaskComments detail={detail} />
    </RouteModal>
  );
}
