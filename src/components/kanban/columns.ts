import type { ColumnView, StageView, TaskCardView } from "./types";

/**
 * One column per stage, in the order given; tasks keep the order they arrive in (the use case sorts them by
 * position). A task whose stage is not in the list is left out rather than creating a phantom column.
 */
export function buildColumns(stages: StageView[], tasks: TaskCardView[]): ColumnView[] {
  const columns = new Map<string, ColumnView>(stages.map((stage) => [stage.id, { stage, tasks: [] }]));
  for (const task of tasks) columns.get(task.stageId)?.tasks.push(task);
  return [...columns.values()];
}
