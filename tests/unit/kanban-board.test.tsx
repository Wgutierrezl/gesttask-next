// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

const moveTaskAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/tasks", () => ({ moveTaskAction }));
const dnd = vi.hoisted(() => ({ props: undefined as undefined | { onDragEnd: (event: unknown) => void; accessibility?: { announcements: { onDragStart: (e: unknown) => string } } } }));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return { ...actual, DndContext: (props: never) => ((dnd.props = props), createElement(actual.DndContext, props)) };
});

const { KanbanBoard } = await import("@/components/kanban/kanban-board");

const task = (id: string, stageId: string, over: Partial<TaskCardView> = {}): TaskCardView => ({
  id, stageId, title: `Task ${id}`, description: "", priority: "medium", dueDate: null, assigneeId: null, completedAt: null, overdue: false, ...over,
});
const columns = (): ColumnView[] => [
  { stage: { id: "todo", name: "To do", isDone: false }, tasks: [task("a", "todo"), task("b", "todo")] },
  { stage: { id: "done", name: "Done", isDone: true }, tasks: [task("d", "done", { completedAt: "2026-10-01T00:00:00.000Z" })] },
];
const props = { names: { u1: "Olivia" }, taskBase: "/boards/b/pipelines/p/tasks/" };
const column = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name},`) });
const titles = (name: string) => within(column(name)).queryAllByRole("heading", { level: 4 }).map((h) => h.textContent);
const sent = (call = 0) => Object.fromEntries([...(moveTaskAction.mock.calls[call]![1] as FormData).entries()]);
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  moveTaskAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("KanbanBoard moves from the menu", () => {
  it("shows the move at once, sends the placement, and keeps it once the server's page agrees", async () => {
    const pending = deferred();
    moveTaskAction.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    expect(titles("Done")).toEqual(["Task d", "Task a"]);
    expect(titles("To do")).toEqual(["Task b"]);
    expect(within(column("Done")).getAllByText(/Completed/)).toHaveLength(2);
    expect(sent()).toEqual({ taskId: "a", toStageId: "done", afterTaskId: "d" });
    await act(async () => pending.resolve({ ok: true, data: null }));
    const moved = columns();
    moved[0]!.tasks = [task("b", "todo")];
    moved[1]!.tasks = [task("d", "done", { completedAt: "2026-10-01T00:00:00.000Z" }), task("a", "done", { completedAt: "2026-10-10T00:00:00.000Z" })];
    rerender(<KanbanBoard columns={moved} canWrite {...props} />);
    expect(titles("Done")).toEqual(["Task d", "Task a"]);
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("puts the card back and says why when the server refuses", async () => {
    const pending = deferred();
    moveTaskAction.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    expect(titles("Done")).toContain("Task a");
    await act(async () => pending.resolve({ ok: false, code: "FORBIDDEN", message: "You do not have permission to do that" }));
    expect(titles("Done")).toEqual(["Task d"]);
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    expect(screen.getByRole("alert").textContent).toBe("You do not have permission to do that");
  });

  it("puts the card back with a generic message when the request itself fails", async () => {
    moveTaskAction.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b up" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The task could not be moved. Try again."));
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
  });

  it("clears the previous error when the next move starts", async () => {
    moveTaskAction.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a down" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Resource not found"));
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a down" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(""));
  });

  it("offers only the moves that exist", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    expect(screen.queryByRole("button", { name: "Move Task a up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Task a down" })).toBeTruthy();
  });
});

describe("KanbanBoard drag and drop", () => {
  it("applies a drop result through the same optimistic path", async () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "column:done" } }));
    await waitFor(() => expect(moveTaskAction).toHaveBeenCalled());
    expect(sent()).toEqual({ taskId: "a", toStageId: "done", afterTaskId: "d" });
  });

  it("ignores drops outside the board and drops that change nothing", async () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: null }));
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "a" } }));
    expect(moveTaskAction).not.toHaveBeenCalled();
  });

  it("gives every card a keyboard-focusable drag handle that announces itself as sortable, and speaks in titles", () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const handle = screen.getByRole("button", { name: "Drag Task a" });
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.getAttribute("aria-roledescription")).toBe("sortable");
    expect(dnd.props!.accessibility!.announcements.onDragStart({ active: { id: "a" } })).toBe("Picked up Task a.");
  });
});

describe("KanbanBoard for viewers", () => {
  it("shows the columns without drag handles or move menus", () => {
    render(<KanbanBoard columns={columns()} canWrite={false} {...props} />);
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    expect(screen.queryByRole("button", { name: /Drag/ })).toBeNull();
    expect(screen.queryByLabelText(/Move options/)).toBeNull();
    expect(screen.getByRole("link", { name: "Task a" }).getAttribute("href")).toBe("/boards/b/pipelines/p/tasks/a");
  });
});
