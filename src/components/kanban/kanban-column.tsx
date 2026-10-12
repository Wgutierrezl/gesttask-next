import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { StageHeader } from "./stage-header";
import type { StageManagement } from "./stage-management";
import { TaskCard } from "./task-card";
import type { ColumnView } from "./types";

/** The frame of a column: header (with its menu for `manage`), the drop zone (empty message and the list its `children` fill), and an optional `footer`. */
export function ColumnShell({ column, listRef, isOver = false, footer, manage, children }: { column: ColumnView; listRef?: (element: HTMLElement | null) => void; isOver?: boolean; footer?: ReactNode; manage?: StageManagement; children: ReactNode }) {
  const { stage, tasks } = column;
  const t = useTranslations("kanban");
  return (
    <section aria-label={t("columnLabel", { name: stage.name, count: tasks.length })} data-drop-target={isOver} className="flex w-80 shrink-0 snap-start flex-col rounded-card border border-border bg-surface-hover p-4">
      <StageHeader stage={stage} count={tasks.length} manage={manage} />
      {/* The drop zone is the whole open area under the header. Its dashed highlight is drawn in the negative margin it
          pads itself with, so the cards do not move when it appears. */}
      <div ref={listRef} className={cn("-m-2.5 flex min-h-[400px] flex-1 flex-col rounded-xl border-2 p-2 transition-colors duration-[var(--duration-fast)]", isOver ? "border-dashed border-border-hover bg-brand-soft" : "border-transparent")}>
        {tasks.length === 0 && !isOver ? <p className="flex h-32 items-center justify-center text-sm text-fg-subtle">{t("noTasks")}</p> : null}
        <ul className="flex flex-col gap-3">
          {children}
        </ul>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
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
