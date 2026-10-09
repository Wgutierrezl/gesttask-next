import type { Priority } from "../value-objects/priority";
import type { TaskStatus } from "../value-objects/task-status";

export interface Task {
  id: string;
  /** Denormalized board id: the policy and aggregates never join through the pipeline. */
  boardId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  /** ISO calendar date (YYYY-MM-DD); may be in the past. */
  dueDate: string | null;
  assigneeId: string | null;
  completedAt: Date | null;
  /** Fractional index inside the stage. */
  position: string;
  createdAt: Date;
}

export type TaskView = Task & { overdue: boolean };

/** Overdue is derived at read time, never stored and never an error (REQ-TSK-05). */
export function isOverdue(task: Pick<Task, "dueDate" | "completedAt">, now: Date): boolean {
  return task.dueDate !== null && task.completedAt === null && task.dueDate < now.toISOString().slice(0, 10);
}

export function withOverdue(task: Task, now: Date): TaskView {
  return { ...task, overdue: isOverdue(task, now) };
}

/** Set once when entering the final stage, kept while it stays there, cleared when it leaves. */
export function resolveCompletedAt(current: Date | null, inTerminalStage: boolean, now: Date): Date | null {
  if (!inTerminalStage) return null;
  return current ?? now;
}
