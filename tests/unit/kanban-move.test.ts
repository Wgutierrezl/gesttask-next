import { describe, expect, it } from "vitest";
import { announcementsFor } from "@/components/kanban/announcements";
import { applyMove, neighborMoves, resolveDrop } from "@/components/kanban/move";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const task = (id: string, stageId: string, over: Partial<TaskCardView> = {}): TaskCardView => ({
  id, stageId, title: `Task ${id}`, description: "", priority: "medium", dueDate: null, assigneeId: null, completedAt: null, overdue: false, ...over,
});
const board = (): ColumnView[] => [
  { stage: { id: "todo", name: "To do", isDone: false }, tasks: [task("a", "todo"), task("b", "todo"), task("c", "todo")] },
  { stage: { id: "doing", name: "In progress", isDone: false }, tasks: [] },
  { stage: { id: "done", name: "Done", isDone: true }, tasks: [task("d", "done", { completedAt: "2026-10-01T00:00:00.000Z" })] },
];
const ids = (columns: ColumnView[]) => columns.map((c) => c.tasks.map((t) => t.id));

describe("applyMove", () => {
  it("reorders inside a stage: after another task, or at the top with null", () => {
    expect(ids(applyMove(board(), { taskId: "a", toStageId: "todo", afterTaskId: "c" }, NOW))[0]).toEqual(["b", "c", "a"]);
    expect(ids(applyMove(board(), { taskId: "c", toStageId: "todo", afterTaskId: null }, NOW))[0]).toEqual(["c", "a", "b"]);
    expect(ids(applyMove(board(), { taskId: "a", toStageId: "todo", afterTaskId: "b" }, NOW))[0]).toEqual(["b", "a", "c"]);
  });

  it("moves to another stage at the requested place, leaving the source without the task", () => {
    const moved = applyMove(board(), { taskId: "b", toStageId: "doing", afterTaskId: null }, NOW);
    expect(ids(moved)).toEqual([["a", "c"], ["b"], ["d"]]);
    expect(moved[1]!.tasks[0]!.stageId).toBe("doing");
    expect(ids(applyMove(board(), { taskId: "b", toStageId: "done", afterTaskId: "d" }, NOW))[2]).toEqual(["d", "b"]);
  });

  it("completes a task entering the done stage and reopens it on the way out, like the server does", () => {
    const entered = applyMove(board(), { taskId: "a", toStageId: "done", afterTaskId: null }, NOW);
    expect(entered[2]!.tasks.find((t) => t.id === "a")!.completedAt).toBe(NOW.toISOString());
    expect(entered[2]!.tasks.find((t) => t.id === "d")!.completedAt).toBe("2026-10-01T00:00:00.000Z");
    const left = applyMove(board(), { taskId: "d", toStageId: "todo", afterTaskId: null }, NOW);
    expect(left[0]!.tasks[0]!.completedAt).toBeNull();
  });

  it("keeps the original completion date for a task that stays in the done stage", () => {
    const same = applyMove(board(), { taskId: "d", toStageId: "done", afterTaskId: null }, NOW);
    expect(same[2]!.tasks[0]!.completedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("recomputes overdue: a late task is no longer overdue once completed, and is again when reopened", () => {
    const late = board();
    late[0]!.tasks[0] = task("a", "todo", { dueDate: "2026-10-01", overdue: true });
    const done = applyMove(late, { taskId: "a", toStageId: "done", afterTaskId: null }, NOW);
    expect(done[2]!.tasks[0]!.overdue).toBe(false);
    const reopened = applyMove(done, { taskId: "a", toStageId: "doing", afterTaskId: null }, NOW);
    expect(reopened[1]!.tasks[0]!.overdue).toBe(true);
  });

  it("does not mutate its input", () => {
    const original = board();
    const snapshot = JSON.stringify(original);
    applyMove(original, { taskId: "a", toStageId: "done", afterTaskId: null }, NOW);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it.each([
    ["an unknown task", { taskId: "zzz", toStageId: "todo", afterTaskId: null }],
    ["an unknown stage", { taskId: "a", toStageId: "nope", afterTaskId: null }],
    ["an anchor that is not in the stage", { taskId: "a", toStageId: "doing", afterTaskId: "b" }],
    ["dropping a task after itself", { taskId: "a", toStageId: "todo", afterTaskId: "a" }],
  ])("leaves the board alone for %s", (_name, move) => {
    const original = board();
    expect(applyMove(original, move, NOW)).toBe(original);
  });
});

describe("resolveDrop", () => {
  it("drops onto a card of the same column with array-move semantics, up or down", () => {
    expect(resolveDrop(board(), "a", "c")).toEqual({ taskId: "a", toStageId: "todo", afterTaskId: "c" });
    expect(resolveDrop(board(), "c", "a")).toEqual({ taskId: "c", toStageId: "todo", afterTaskId: null });
    expect(resolveDrop(board(), "c", "b")).toEqual({ taskId: "c", toStageId: "todo", afterTaskId: "a" });
  });

  it("drops onto a card of another column before that card", () => {
    expect(resolveDrop(board(), "a", "d")).toEqual({ taskId: "a", toStageId: "done", afterTaskId: null });
  });

  it("drops onto an empty or open area of a column at its end", () => {
    expect(resolveDrop(board(), "a", "column:doing")).toEqual({ taskId: "a", toStageId: "doing", afterTaskId: null });
    expect(resolveDrop(board(), "a", "column:done")).toEqual({ taskId: "a", toStageId: "done", afterTaskId: "d" });
    expect(resolveDrop(board(), "a", "column:todo")).toEqual({ taskId: "a", toStageId: "todo", afterTaskId: "c" });
  });

  it("asks for nothing when the task would stay where it is", () => {
    expect(resolveDrop(board(), "a", "a")).toBeNull();
    expect(resolveDrop(board(), "b", "a")).toEqual({ taskId: "b", toStageId: "todo", afterTaskId: null });
    expect(resolveDrop(board(), "c", "column:todo")).toBeNull();
    expect(resolveDrop(board(), "a", "b")).toEqual({ taskId: "a", toStageId: "todo", afterTaskId: "b" });
    expect(resolveDrop(board(), "ghost", "a")).toBeNull();
    expect(resolveDrop(board(), "a", "ghost")).toBeNull();
    expect(resolveDrop(board(), "d", "column:done")).toBeNull();
  });
});

describe("neighborMoves", () => {
  it("offers up and down where they exist, and every other stage at its end", () => {
    const middle = neighborMoves(board(), "b");
    expect(middle.up).toEqual({ taskId: "b", toStageId: "todo", afterTaskId: null });
    expect(middle.down).toEqual({ taskId: "b", toStageId: "todo", afterTaskId: "c" });
    expect(middle.toStages).toEqual([
      { stageId: "doing", name: "In progress", request: { taskId: "b", toStageId: "doing", afterTaskId: null } },
      { stageId: "done", name: "Done", request: { taskId: "b", toStageId: "done", afterTaskId: "d" } },
    ]);
    const first = neighborMoves(board(), "a");
    expect(first.up).toBeNull();
    expect(first.down).toEqual({ taskId: "a", toStageId: "todo", afterTaskId: "b" });
    expect(neighborMoves(board(), "c").down).toBeNull();
    expect(neighborMoves(board(), "c").up).toEqual({ taskId: "c", toStageId: "todo", afterTaskId: "a" });
  });

  it("offers nothing for an unknown task", () => {
    expect(neighborMoves(board(), "zzz")).toEqual({ up: null, down: null, toStages: [] });
  });
});

describe("announcementsFor", () => {
  const say = announcementsFor(board());
  it("speaks in task titles and stage names, never ids", () => {
    expect(say.onDragStart({ active: { id: "a" } } as never)).toBe("Picked up Task a.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "d" } } as never)).toBe("Task a is over Task d in Done.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "a" } } as never)).toBe("Task a is in its original place.");
    expect(say.onDragOver({ active: { id: "a" }, over: null } as never)).toBe("Task a is not over a drop area.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "column:doing" } } as never)).toBe("Task a is over the In progress column.");
    expect(say.onDragEnd({ active: { id: "a" }, over: { id: "column:doing" } } as never)).toBe("Dropped Task a on the In progress column.");
    expect(say.onDragEnd({ active: { id: "a" }, over: null } as never)).toBe("Task a was dropped outside the board and stays where it was.");
    expect(say.onDragCancel({ active: { id: "a" } } as never)).toBe("Move cancelled. Task a stays where it was.");
  });
});
