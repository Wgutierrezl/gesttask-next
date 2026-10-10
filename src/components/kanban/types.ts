/** Plain data the Kanban components work with: dates are strings so everything can cross to client components. */
export type PriorityName = "low" | "medium" | "high";

export interface StageView {
  id: string;
  name: string;
  isDone: boolean;
}

export interface TaskCardView {
  id: string;
  stageId: string;
  title: string;
  description: string;
  priority: PriorityName;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  assigneeId: string | null;
  /** ISO timestamp, set while the task sits in the done stage. */
  completedAt: string | null;
  overdue: boolean;
}

export interface ColumnView {
  stage: StageView;
  tasks: TaskCardView[];
}

export interface MemberOption {
  userId: string;
  name: string;
}
