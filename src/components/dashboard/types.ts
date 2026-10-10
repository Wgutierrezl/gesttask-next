/** What the dashboard components render; the use cases' results satisfy these structurally (components do not import the domain). */
export interface Counts {
  total: number;
  byPriority: { low: number; medium: number; high: number };
  byStatus: { active: number; inactive: number };
  overdue: number;
}

export interface PipelineStatsData {
  id: string;
  name: string;
  tasks: Counts;
  stages: { id: string; name: string; isDone: boolean; tasks: Counts }[];
}
