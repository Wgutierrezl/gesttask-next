import { TaskCard } from "./task-card";
import type { ColumnView } from "./types";

/** A stage and its tasks. `nameOf` resolves an assignee id to a display name (null when unknown). */
export function KanbanColumn({ column, nameOf, taskHref }: { column: ColumnView; nameOf: (userId: string) => string | null; taskHref?: (taskId: string) => string }) {
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
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} assigneeName={task.assigneeId ? nameOf(task.assigneeId) : null} href={taskHref?.(task.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
