import type { TaskCardView, StageView } from "@/components/kanban/types";

const PAGE = 200;
/** Most tasks one Kanban page loads; beyond it the page says so instead of silently dropping the rest. */
export const TASK_LOAD_CAP = 1000;
/** Most stages or members a page loads; beyond it the page says so. */
export const LIST_LOAD_CAP = 200;

type Page = { limit: number; offset: number };

/** Reads a list page by page (the use cases cap a page at 200) up to `cap` rows, and says whether anything was left out. */
export async function loadCapped<T>(list: (page: Page) => Promise<T[]>, cap = TASK_LOAD_CAP): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  while (items.length < cap) {
    const limit = Math.min(PAGE, cap - items.length);
    const rows = await list({ limit, offset: items.length });
    items.push(...rows);
    if (rows.length < limit) return { items, truncated: false };
  }
  // Exactly at the cap: one more row decides whether anything was left out.
  return { items, truncated: (await list({ limit: 1, offset: cap })).length > 0 };
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

/** Display names of the given assignees, looked up by id in chunks (a lookup takes at most 200), so no one depends on a capped member list. */
export async function loadAssigneeNames<T extends { userId: string; name: string }>(
  lookup: (userIds: string[]) => Promise<T[]>,
  assigneeIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(assigneeIds.filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LIST_LOAD_CAP) {
    for (const { userId, name } of await lookup(ids.slice(i, i + LIST_LOAD_CAP))) names.set(userId, name);
  }
  return names;
}
