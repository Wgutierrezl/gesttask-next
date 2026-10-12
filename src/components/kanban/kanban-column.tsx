import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { TaskCard } from "./task-card";
import type { ColumnView } from "./types";

/** The frame of a column: header with the done marker and count, the empty message, the list its `children` fill, and an optional `footer`. */
export function ColumnShell({ column, listRef, isOver = false, footer, children }: { column: ColumnView; listRef?: (element: HTMLUListElement | null) => void; isOver?: boolean; footer?: ReactNode; children: ReactNode }) {
  const { stage, tasks } = column;
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  return (
    <section aria-label={`${stage.name}, ${count}`} data-drop-target={isOver} className={cn("flex w-72 shrink-0 snap-start flex-col gap-3 rounded-card p-3 transition-colors duration-[var(--duration-fast)]", isOver ? "bg-brand-soft ring-2 ring-ring" : "bg-surface-muted")}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-fg">{stage.name}</h3>
        <span className="flex items-center gap-2">
          {stage.isDone ? <Badge tone="success">Done stage</Badge> : null}
          <span data-testid="column-count" className="inline-flex min-w-6 justify-center rounded-pill bg-surface px-2 py-0.5 text-xs font-medium text-fg-strong">{tasks.length}</span>
        </span>
      </header>
      {tasks.length === 0 ? <p className="rounded-control border border-dashed border-border-strong px-3 py-4 text-center text-xs text-fg-muted">No tasks</p> : null}
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
