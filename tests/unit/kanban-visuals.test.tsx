// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

vi.mock("@/app/_actions/tasks", () => ({ moveTaskAction: vi.fn(), moveTaskToEndAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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

describe("KanbanBoard layout", () => {
  it("exposes the columns in a scrollable, snap-aligned strip and keeps the live region", () => {
    const columns: ColumnView[] = [{ stage: { id: "s1", name: "To do", isDone: false }, tasks: [task()] }];
    render(<KanbanBoard columns={columns} canWrite names={{}} taskBase="/t/" />);
    expect(screen.getByRole("status", { name: "Board updates" })).toBeTruthy();
    expect(screen.getByTestId("board-scroller").className).toMatch(/snap-x/);
    expect(screen.getByRole("button", { name: "Drag Write docs" })).toBeTruthy();
  });
});
