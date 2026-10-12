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
  it("shows the assignee as the first letter of their name in a round badge, with the full name kept as text for assistive tech", () => {
    render(<TaskCard task={task({ assigneeId: "u1" })} assigneeName="Olivia Stone" />);
    expect(screen.getByText("O").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("O").getAttribute("title")).toBe("Olivia Stone");
    expect(screen.getByText("Olivia Stone")).toBeTruthy();
    expect(screen.queryByText("OS")).toBeNull();
  });

  it("keeps Unassigned as text without a badge", () => {
    render(<TaskCard task={task()} assigneeName={null} />);
    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.queryByText("?")).toBeNull();
  });

  it("spells the priority out next to a dot, for each priority", () => {
    for (const [priority, label] of [["high", "High"], ["medium", "Medium"], ["low", "Low"]] as const) {
      const { unmount } = render(<TaskCard task={task({ priority })} assigneeName={null} />);
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });

  it("shows the description under the title only when the task has one", () => {
    const { unmount } = render(<TaskCard task={task({ description: "Document tokens and spacing." })} assigneeName={null} />);
    expect(screen.getByText("Document tokens and spacing.")).toBeTruthy();
    unmount();
    const { container } = render(<TaskCard task={task({ description: "" })} assigneeName={null} />);
    expect([...container.querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual(["High"]); // only the priority line
  });

  it("renders the due date as a short day in a chip, machine-readable, with the full date for assistive tech, and flags overdue in text", () => {
    const { container } = render(<TaskCard task={task({ dueDate: "2026-10-01", overdue: true })} assigneeName={null} />);
    const chip = container.querySelector("time")!;
    expect(chip.getAttribute("datetime")).toBe("2026-10-01");
    expect(within(chip).getByText("Oct 1").getAttribute("aria-hidden")).toBe("true");
    expect(within(chip).getByText("Due Oct 1, 2026")).toBeTruthy();
    expect(within(chip).getByText("Overdue")).toBeTruthy();
  });

  it("does not add an overdue mark to a due date that is not late", () => {
    const { container } = render(<TaskCard task={task({ dueDate: "2026-10-01", overdue: false })} assigneeName={null} />);
    expect(within(container.querySelector("time")!).queryByText("Overdue")).toBeNull();
  });

  it("writes the short due day in Spanish", () => {
    const { container } = render(<TaskCard task={task({ dueDate: "2026-10-16" })} assigneeName={null} />, { locale: "es" });
    expect(within(container.querySelector("time")!).getByText("16 oct")).toBeTruthy();
  });

  it("has no footer when there is nothing to put in it", () => {
    const { container } = render(<TaskCard task={task()} assigneeName={null} />);
    expect(container.querySelector("footer")).toBeNull();
    cleanup();
    const withDate = render(<TaskCard task={task({ dueDate: "2026-10-01" })} assigneeName={null} />);
    expect(withDate.container.querySelector("footer")).not.toBeNull();
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
  it("shows a Done chip with the completion time kept as text for assistive tech, and no chip while the task is open", async () => {
    const { unmount } = render(<TaskCard task={task({ completedAt: "2026-10-02T10:00:00.000Z" })} assigneeName={null} />);
    expect(screen.getByText("Done").getAttribute("aria-hidden")).toBe("true");
    expect((await screen.findByText(/^Completed Oct 2, 2026/)).tagName).toBe("TIME"); // in the viewer's own time zone once mounted
    unmount();
    render(<TaskCard task={task()} assigneeName={null} />);
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText(/^Completed/)).toBeNull();
  });

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

  it("hides the empty-column message while a card hovers it, and brings it back when the card leaves", () => {
    render(<KanbanBoard columns={columns} canWrite names={{}} taskBase="/t/" />);
    const done = () => screen.getByRole("region", { name: "Done, 0 tasks" });
    expect(within(done()).getByText("No tasks")).toBeTruthy();
    act(() => dnd.props!.onDragOver({ over: { id: "column:s2" } }));
    expect(within(done()).queryByText("No tasks")).toBeNull();
    act(() => dnd.props!.onDragOver({ over: null }));
    expect(within(done()).getByText("No tasks")).toBeTruthy();
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
