import { describe, expect, it } from "vitest";
import { isOverdue, resolveCompletedAt, withOverdue, type Task } from "./task";

const NOW = new Date("2026-10-09T12:00:00.000Z");

const base: Task = {
  id: "t1",
  boardId: "b1",
  pipelineId: "p1",
  stageId: "s1",
  title: "Write spec",
  description: "",
  priority: "high",
  status: "active",
  dueDate: null,
  assigneeId: null,
  completedAt: null,
  position: "V",
  createdAt: NOW,
};

describe("isOverdue", () => {
  it.each([
    ["past due date and still open", "2026-10-08", null, true],
    ["due today is not overdue yet", "2026-10-09", null, false],
    ["future due date", "2026-10-10", null, false],
    ["no due date", null, null, false],
    ["past due date but completed", "2026-10-01", new Date("2026-10-02T00:00:00Z"), false],
  ] as const)("%s", (_label, dueDate, completedAt, expected) => {
    expect(isOverdue({ dueDate, completedAt }, NOW)).toBe(expected);
  });

  it("is a read-time flag: it never alters the task", () => {
    const task = { ...base, dueDate: "2020-01-01" };
    expect(withOverdue(task, NOW)).toEqual({ ...task, overdue: true });
    expect(task).not.toHaveProperty("overdue");
  });
});

describe("resolveCompletedAt", () => {
  const earlier = new Date("2026-10-01T00:00:00.000Z");

  it("stamps the time when the task enters the final stage", () => {
    expect(resolveCompletedAt(null, true, NOW)).toEqual(NOW);
  });

  it("keeps the original stamp while it stays in the final stage", () => {
    expect(resolveCompletedAt(earlier, true, NOW)).toEqual(earlier);
  });

  it("clears the stamp when it leaves the final stage", () => {
    expect(resolveCompletedAt(earlier, false, NOW)).toBeNull();
  });

  it("stays empty while it is not in the final stage", () => {
    expect(resolveCompletedAt(null, false, NOW)).toBeNull();
  });
});
