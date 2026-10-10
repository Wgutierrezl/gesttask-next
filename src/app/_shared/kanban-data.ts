import type { TaskCardView, StageView } from "@/components/kanban/types";

const PAGE = 200;
/** Most tasks one Kanban page loads; beyond it the page says so instead of silently dropping the rest. */
export const TASK_LOAD_CAP = 1000;

type Page = { limit: number; offset: number };

/** Reads a pipeline's tasks page by page (the use case caps a page at 200) up to `cap`. */
export async function loadTasks<T>(list: (page: Page) => Promise<T[]>, cap = TASK_LOAD_CAP): Promise<{ tasks: T[]; truncated: boolean }> {
  const tasks: T[] = [];
  while (tasks.length < cap) {
    const limit = Math.min(PAGE, cap - tasks.length);
    const rows = await list({ limit, offset: tasks.length });
    tasks.push(...rows);
    if (rows.length < limit) return { tasks, truncated: false };
  }
  // Exactly at the cap: one more row decides whether anything was left out.
  return { tasks, truncated: (await list({ limit: 1, offset: cap })).length > 0 };
}

export const toStageView = (stage: { id: string; name: string; isDone: boolean }): StageView => ({ id: stage.id, name: stage.name, isDone: stage.isDone });

export function toTaskCardView(task: {
  id: string;
  stageId: string;
  title: string;
  description: string;
  priority: TaskCardView["priority"];
  dueDate: string | null;
  assigneeId: string | null;
  completedAt: Date | null;
  overdue: boolean;
}): TaskCardView {
  return {
    id: task.id,
    stageId: task.stageId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    overdue: task.overdue,
  };
}
