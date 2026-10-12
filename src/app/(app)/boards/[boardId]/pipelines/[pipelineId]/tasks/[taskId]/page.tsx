import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadTaskDetail, StagesTruncatedNotice, TaskComments, TaskDescription, TaskDetailsCard, TaskMoveCard, type TaskRouteParams } from "@/app/_shared/task-detail";
import { requirePageActor } from "@/app/_shared/require-page-actor";
import { TaskActions } from "@/components/kanban/task-actions";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata() {
  return { title: (await getTranslations("meta"))("task") };
}

interface TaskPageProps {
  params: Promise<TaskRouteParams>;
}

/** The full page: reached by a direct link or a reload. From the board the same task opens as a modal (see `@modal`). */
export default async function TaskPage({ params }: TaskPageProps) {
  const actor = await requirePageActor();
  const route = await params;
  const detail = await loadTaskDetail(route, actor);
  const t = await getTranslations("task.detail");
  const k = await getTranslations("kanban.page");
  const { task, members, canWrite } = detail;
  return (
    <main className="flex flex-col gap-6">
      <nav aria-label={k("breadcrumb")} className="text-sm">
        <Link href={`/boards/${route.boardId}/pipelines/${route.pipelineId}`} className="inline-flex items-center gap-1 rounded text-fg-muted hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-ring"><ChevronLeft aria-hidden="true" className="size-4" />{t("back")}</Link>
      </nav>
      <PageHeader title={task.title} actions={canWrite ? <TaskActions task={task} members={members} /> : undefined} />
      <StagesTruncatedNotice detail={detail} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <TaskDescription description={task.description} />
          <TaskComments detail={detail} />
        </div>
        <aside aria-label={t("aside")} className="flex flex-col gap-6">
          <TaskDetailsCard detail={detail} level={2} />
          {canWrite ? <TaskMoveCard detail={detail} level={2} /> : null}
        </aside>
      </div>
    </main>
  );
}
