import { describe, expect, it } from "vitest";
import { addCounts, buildBoardDashboard, emptyCounts, type StageCountRow, type TaskCounts } from "./dashboard";

const counts = (extra: Partial<TaskCounts> & { low?: number; medium?: number; high?: number; active?: number; inactive?: number } = {}): TaskCounts => {
  const { low = 0, medium = 0, high = 0, active = 0, inactive = 0, overdue = 0 } = extra;
  return { total: low + medium + high, byPriority: { low, medium, high }, byStatus: { active, inactive }, overdue };
};

describe("task counts", () => {
  it("start at zero for every priority and status, never missing a key", () => {
    expect(emptyCounts()).toEqual({ total: 0, byPriority: { low: 0, medium: 0, high: 0 }, byStatus: { active: 0, inactive: 0 }, overdue: 0 });
  });

  it("add up field by field without touching the operands", () => {
    const a = counts({ low: 1, high: 2, active: 3, overdue: 1 });
    const b = counts({ low: 4, medium: 1, inactive: 2, overdue: 2 });
    expect(addCounts(a, b)).toEqual({ total: 8, byPriority: { low: 5, medium: 1, high: 2 }, byStatus: { active: 3, inactive: 2 }, overdue: 3 });
    expect(a).toEqual(counts({ low: 1, high: 2, active: 3, overdue: 1 }));
  });
});

describe("buildBoardDashboard", () => {
  const stage = (id: string, name: string, tasks: TaskCounts, isDone = false) => ({ id, name, isDone, tasks });

  it("a board with nothing in it is all zeros with the member count, not an error", () => {
    expect(buildBoardDashboard("b1", 1, [])).toEqual({ boardId: "b1", members: 1, pipelines: [], tasks: emptyCounts() });
  });

  it("keeps stages with no tasks (zeros) and pipelines with no stages, in the order the rows come", () => {
    const rows: StageCountRow[] = [
      { pipelineId: "p1", pipelineName: "Alpha", stage: stage("s1", "To do", counts({ high: 2, active: 2, overdue: 1 })) },
      { pipelineId: "p1", pipelineName: "Alpha", stage: stage("s2", "Done", emptyCounts(), true) },
      { pipelineId: "p2", pipelineName: "Beta", stage: null },
    ];
    const dashboard = buildBoardDashboard("b1", 3, rows);
    expect(dashboard.pipelines.map((p) => [p.id, p.name, p.stages.map((s) => s.name)])).toEqual([["p1", "Alpha", ["To do", "Done"]], ["p2", "Beta", []]]);
    expect(dashboard.pipelines[0]!.stages[1]!.tasks).toEqual(emptyCounts());
    expect(dashboard.pipelines[1]!.tasks).toEqual(emptyCounts());
  });

  it("totals each pipeline from its stages and the board from its pipelines", () => {
    const rows: StageCountRow[] = [
      { pipelineId: "p1", pipelineName: "A", stage: stage("s1", "x", counts({ low: 1, active: 1 })) },
      { pipelineId: "p1", pipelineName: "A", stage: stage("s2", "y", counts({ medium: 2, inactive: 2, overdue: 1 })) },
      { pipelineId: "p2", pipelineName: "B", stage: stage("s3", "z", counts({ high: 4, active: 4, overdue: 2 })) },
    ];
    const dashboard = buildBoardDashboard("b1", 2, rows);
    expect(dashboard.pipelines[0]!.tasks).toEqual(counts({ low: 1, medium: 2, active: 1, inactive: 2, overdue: 1 }));
    expect(dashboard.tasks).toEqual(counts({ low: 1, medium: 2, high: 4, active: 5, inactive: 2, overdue: 3 }));
  });
});
