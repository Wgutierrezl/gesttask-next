// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

vi.mock("@/app/_actions/tasks", () => ({ moveTaskAction: vi.fn(), moveTaskToEndAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const dnd = vi.hoisted(() => ({ props: undefined as undefined | { onDragOver: (event: unknown) => void } }));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return { ...actual, DndContext: (props: never) => ((dnd.props = props), createElement(actual.DndContext, props)) };
});

const { TaskCard } = await import("@/components/kanban/task-card");
const { KanbanColumn } = await import("@/components/kanban/kanban-column");
const { KanbanBoard } = await import("@/components/kanban/kanban-board");

const task = (over: Partial<TaskCardView> = {}): TaskCardView => ({
  id: "t1", stageId: "s1", title: "Write docs", description: "", priority: "high", dueDate: null, assigneeId: null, completedAt: null, overdue: false, ...over,
});
afterEach(cleanup);

describe("TaskCard visuals", () => {
  it("shows the assignee as initials with the full name kept as text", () => {
    render(<TaskCard task={task({ assigneeId: "u1" })} assigneeName="Olivia Stone" />);
    expect(screen.getByText("OS")).toBeTruthy();
    expect(screen.getByText("Olivia Stone")).toBeTruthy();
  });

  it("keeps Unassigned as text without initials", () => {
    render(<TaskCard task={task()} assigneeName={null} />);
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.queryByText("?")).toBeNull();
  });

  it("renders the due date as a machine-readable time, and flags overdue in text", () => {
    const { container } = render(<TaskCard task={task({ dueDate: "2026-10-01", overdue: true })} assigneeName={null} />);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-01");
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("keeps the title as an h4 link when it has an href", () => {
    render(<TaskCard task={task()} assigneeName={null} href="/x" />);
    expect(within(screen.getByRole("heading", { level: 4 })).getByRole("link", { name: "Write docs" }).getAttribute("href")).toBe("/x");
  });
});

describe("KanbanColumn visuals", () => {
  it("keeps the region label and shows the count and done marker in the header", () => {
    const column: ColumnView = { stage: { id: "s1", name: "Done", isDone: true }, tasks: [task(), task({ id: "t2", title: "Other" })] };
    render(<KanbanColumn column={column} nameOf={() => null} />);
    const region = screen.getByRole("region", { name: "Done, 2 tasks" });
    expect(within(region).getByRole("heading", { level: 3 }).textContent).toBe("Done");
    expect(within(region).getByText("Done stage")).toBeTruthy();
    expect(within(region).getByTestId("column-count").textContent).toBe("2");
  });
});

describe("TaskCard completed", () => {
  it("does not flag a completed task as overdue", () => {
    render(<TaskCard task={task({ dueDate: "2026-10-01", overdue: true, completedAt: "2026-10-02T10:00:00.000Z" })} assigneeName={null} />);
    expect(screen.queryByText("Overdue")).toBeNull();
  });
});

describe("KanbanColumn empty", () => {
  it("says there are no tasks", () => {
    render(<KanbanColumn column={{ stage: { id: "s1", name: "Empty", isDone: false }, tasks: [] }} nameOf={() => null} />);
    expect(within(screen.getByRole("region", { name: "Empty, 0 tasks" })).getByText("No tasks")).toBeTruthy();
  });
});

describe("KanbanBoard dragging", () => {
  const columns: ColumnView[] = [
    { stage: { id: "s1", name: "To do", isDone: false }, tasks: [task()] },
    { stage: { id: "s2", name: "Done", isDone: true }, tasks: [] },
  ];

  it("keeps the live region and drag handle", () => {
    render(<KanbanBoard columns={columns} canWrite names={{}} taskBase="/t/" />);
    expect(screen.getByRole("status", { name: "Board updates" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Drag Write docs" })).toBeTruthy();
  });

  it("exposes only one heading for the dragged card while dragging, and clears the dragging state on cancel", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns} canWrite names={{}} taskBase="/t/" />);
    const scroller = screen.getByTestId("board-scroller");
    expect(scroller.getAttribute("data-dragging")).toBe("false");
    screen.getByRole("article", { name: "Drag Write docs" }).focus();
    await user.keyboard(" ");
    await waitFor(() => expect(scroller.getAttribute("data-dragging")).toBe("true"));
    expect(screen.getAllByRole("heading", { level: 4, name: "Write docs" })).toHaveLength(1);
    expect(document.querySelectorAll("h4")).toHaveLength(2);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(scroller.getAttribute("data-dragging")).toBe("false"));
  });

  it("marks the column the pointer is over as the drop target, from a card id or a column id", () => {
    render(<KanbanBoard columns={columns} canWrite names={{}} taskBase="/t/" />);
    const done = () => screen.getByRole("region", { name: "Done, 0 tasks" });
    act(() => dnd.props!.onDragOver({ over: { id: "column:s2" } }));
    expect(done().getAttribute("data-drop-target")).toBe("true");
    act(() => dnd.props!.onDragOver({ over: { id: "t1" } }));
    expect(done().getAttribute("data-drop-target")).toBe("false");
    expect(screen.getByRole("region", { name: "To do, 1 task" }).getAttribute("data-drop-target")).toBe("true");
    act(() => dnd.props!.onDragOver({ over: null }));
    expect(done().getAttribute("data-drop-target")).toBe("false");
  });
});
