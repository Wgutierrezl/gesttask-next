import { PRIORITIES, type Priority } from "../value-objects/priority";
import { TASK_STATUSES, type TaskStatus } from "../value-objects/task-status";

/**
 * How many tasks there are, split every way a dashboard shows them. Every priority and status is always present, so a
 * quiet board reads as zeros and never as a missing key or an error (REQ-DSH-02).
 */
export interface TaskCounts {
  total: number;
  byPriority: Record<Priority, number>;
  byStatus: Record<TaskStatus, number>;
  /** Past due and not completed (see `isOverdue`). */
  overdue: number;
}

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

export const emptyCounts = (): TaskCounts => ({ total: 0, byPriority: zeros(PRIORITIES), byStatus: zeros(TASK_STATUSES), overdue: 0 });

export function addCounts(a: TaskCounts, b: TaskCounts): TaskCounts {
  const sum = <K extends string>(keys: readonly K[], x: Record<K, number>, y: Record<K, number>) =>
    Object.fromEntries(keys.map((key) => [key, x[key] + y[key]])) as Record<K, number>;
  return {
    total: a.total + b.total,
    byPriority: sum(PRIORITIES, a.byPriority, b.byPriority),
    byStatus: sum(TASK_STATUSES, a.byStatus, b.byStatus),
    overdue: a.overdue + b.overdue,
  };
}

/** What a person has on their plate: the boards they are on and the tasks assigned to them on those boards. */
export interface UserDashboard {
  boards: number;
  assigned: TaskCounts;
}

export interface StageDashboard {
  id: string;
  name: string;
  isDone: boolean;
  tasks: TaskCounts;
}

export interface PipelineDashboard {
  id: string;
  name: string;
  stages: StageDashboard[];
  tasks: TaskCounts;
}

export interface BoardDashboard {
  boardId: string;
  members: number;
  pipelines: PipelineDashboard[];
  tasks: TaskCounts;
}

/** One row of the board aggregation: a stage with its counts, or a pipeline that has no stage yet (`stage: null`). */
export interface StageCountRow {
  pipelineId: string;
  pipelineName: string;
  stage: StageDashboard | null;
}

/**
 * Folds the rows of the single aggregation query into the dashboard. Rows arrive ordered (pipelines, then stages in
 * board order); the totals of pipelines and board are derived here so the database only counts once.
 */
export function buildBoardDashboard(boardId: string, members: number, rows: readonly StageCountRow[]): BoardDashboard {
  const pipelines = new Map<string, PipelineDashboard>();
  for (const row of rows) {
    let pipeline = pipelines.get(row.pipelineId);
    if (!pipeline) pipelines.set(row.pipelineId, (pipeline = { id: row.pipelineId, name: row.pipelineName, stages: [], tasks: emptyCounts() }));
    if (row.stage) {
      pipeline.stages.push(row.stage);
      pipeline.tasks = addCounts(pipeline.tasks, row.stage.tasks);
    }
  }
  const list = [...pipelines.values()];
  return { boardId, members, pipelines: list, tasks: list.reduce((total, p) => addCounts(total, p.tasks), emptyCounts()) };
}
