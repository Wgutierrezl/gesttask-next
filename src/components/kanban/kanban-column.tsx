import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { StageHeader } from "./stage-header";
import type { StageManagement } from "./stage-management";
import { TaskCard } from "./task-card";
import type { ColumnView } from "./types";

/** The frame of a column: header (with its menu for `manage`), the empty message, the list its `children` fill, and an optional `footer`. */
export function ColumnShell({ column, listRef, isOver = false, footer, manage, children }: { column: ColumnView; listRef?: (element: HTMLUListElement | null) => void; isOver?: boolean; footer?: ReactNode; manage?: StageManagement; children: ReactNode }) {
  const { stage, tasks } = column;
  const t = useTranslations("kanban");
  return (
    <section aria-label={t("columnLabel", { name: stage.name, count: tasks.length })} data-drop-target={isOver} className={cn("flex w-80 shrink-0 snap-start flex-col gap-3 rounded-card border border-border p-4 transition-colors duration-[var(--duration-fast)]", isOver ? "bg-brand-soft ring-2 ring-ring" : "bg-surface-muted")}>
      <StageHeader stage={stage} count={tasks.length} manage={manage} />
      {tasks.length === 0 ? <p className="rounded-control border border-dashed border-border-strong px-3 py-4 text-center text-xs text-fg-muted">{t("noTasks")}</p> : null}
      <ul ref={listRef} className="flex min-h-12 flex-col gap-2">
        {children}
      </ul>
      {footer}
    </section>
  );
}

/** A read-only column. `nameOf` resolves an assignee id to a display name (null when unknown). */
export function KanbanColumn({ column, nameOf, taskHref }: { column: ColumnView; nameOf: (userId: string) => string | null; taskHref?: (taskId: string) => string }) {
  return (
    <ColumnShell column={column}>
      {column.tasks.map((task) => (
        <li key={task.id}>
          <TaskCard task={task} assigneeName={task.assigneeId ? nameOf(task.assigneeId) : null} href={taskHref?.(task.id)} />
        </li>
      ))}
    </ColumnShell>
  );
}
