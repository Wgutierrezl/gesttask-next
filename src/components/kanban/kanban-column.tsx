import type { ReactNode } from "react";
import { TaskCard } from "./task-card";
import type { ColumnView } from "./types";

/** The frame of a column: header with the done marker and count, the empty message, and the list its `children` fill. */
export function ColumnShell({ column, listRef, children }: { column: ColumnView; listRef?: (element: HTMLUListElement | null) => void; children: ReactNode }) {
  const { stage, tasks } = column;
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  return (
    <section aria-label={`${stage.name}, ${count}`} className="flex w-72 shrink-0 flex-col gap-3 rounded bg-gray-50 p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{stage.name}</h3>
        <span className="flex items-center gap-2 text-xs text-gray-600">
          {stage.isDone ? <span className="rounded bg-green-100 px-2 py-0.5 text-green-900">Done stage</span> : null}
          {tasks.length}
        </span>
      </header>
      {tasks.length === 0 ? <p className="text-xs text-gray-600">No tasks</p> : null}
      <ul ref={listRef} className="flex min-h-12 flex-col gap-2">
        {children}
      </ul>
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
