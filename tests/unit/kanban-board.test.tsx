// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

const moveTaskAction = vi.hoisted(() => vi.fn());
const moveTaskToEndAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/tasks", () => ({ moveTaskAction, moveTaskToEndAction }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
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
const sent = (call = 0, action = moveTaskAction) => Object.fromEntries([...(action.mock.calls[call]![1] as FormData).entries()]);
const status = () => screen.getByRole("status", { name: "Board updates" }).textContent;
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  moveTaskAction.mockResolvedValue({ ok: true, data: null });
  moveTaskToEndAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("KanbanBoard moves from the menu", () => {
  it("shows the move at once, sends the placement, and keeps it once the server's page agrees", async () => {
    const pending = deferred();
    moveTaskToEndAction.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    expect(titles("Done")).toEqual(["Task d", "Task a"]);
    expect(titles("To do")).toEqual(["Task b"]);
    expect(within(column("Done")).getAllByText(/Completed/)).toHaveLength(2);
    expect(sent(0, moveTaskToEndAction)).toEqual({ taskId: "a", toStageId: "done" });
    await act(async () => pending.resolve({ ok: true, data: null }));
    const moved = columns();
    moved[0]!.tasks = [task("b", "todo")];
    moved[1]!.tasks = [task("d", "done", { completedAt: "2026-10-01T00:00:00.000Z" }), task("a", "done", { completedAt: "2026-10-10T00:00:00.000Z" })];
    rerender(<KanbanBoard columns={moved} canWrite {...props} />);
    expect(titles("Done")).toEqual(["Task d", "Task a"]);
    expect(status()).toBe("Moved Task a to Done");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("puts the card back and says why when the server refuses", async () => {
    const pending = deferred();
    moveTaskToEndAction.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    expect(titles("Done")).toContain("Task a");
    await act(async () => pending.resolve({ ok: false, code: "FORBIDDEN", message: "You do not have permission to do that" }));
    expect(titles("Done")).toEqual(["Task d"]);
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    expect(status()).toContain("You do not have permission to do that");
    expect(status()).toContain("Couldn't move Task a \u2014 restored");
  });

  it("refreshes the page from the server when a move is refused, so the board shows server truth", async () => {
    moveTaskToEndAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "The task changed column concurrently; retry" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(status()).toContain("The task changed column concurrently; retry");
  });

  it("puts the card back with a generic message when the request itself fails", async () => {
    moveTaskAction.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b up" }));
    await waitFor(() => expect(status()).toContain("The task could not be moved. Try again."));
    // The error message is state set right after the rejection; the optimistic move only snaps back when the whole
    // transition commits, a render later. Wait for that commit instead of reading the cards at the message's instant.
    await waitFor(() => expect(titles("To do")).toEqual(["Task a", "Task b"]));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears old errors when a new move starts with nothing in flight", async () => {
    moveTaskAction.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a down" }));
    await waitFor(() => expect(status()).toContain("Resource not found"));
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a down" }));
    await waitFor(() => expect(status()).not.toContain("Resource not found"));
  });

  it("sends overlapping moves one at a time and keeps the message of every failure", async () => {
    const first = deferred();
    const second = deferred();
    moveTaskToEndAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b to Done" }));
    expect(moveTaskToEndAction).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ ok: false, code: "CONFLICT", message: "First failed" }));
    await waitFor(() => expect(moveTaskToEndAction).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({ ok: false, code: "NOT_FOUND", message: "Second failed" }));
    expect(status()).toContain("First failed");
    expect(status()).toContain("Second failed");
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
  });

  it("still sends the second move when the first one fails", async () => {
    moveTaskToEndAction.mockResolvedValueOnce({ ok: false, code: "CONFLICT", message: "First failed" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b to Done" }));
    await waitFor(() => expect(moveTaskToEndAction).toHaveBeenCalledTimes(2));
    expect(moveTaskToEndAction.mock.calls.map(([, form]) => (form as FormData).get("taskId"))).toEqual(["a", "b"]);
  });

  it("moves to the end of a stage on the server, with no anchor from the browser", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await waitFor(() => expect(moveTaskToEndAction).toHaveBeenCalledTimes(1));
    expect(moveTaskAction).not.toHaveBeenCalled();
    expect(Object.fromEntries([...(moveTaskToEndAction.mock.calls[0]![1] as FormData).entries()])).toEqual({ taskId: "a", toStageId: "done" });
  });

  it("returns focus to the moved card's drag handle after a move and after a rollback", async () => {
    moveTaskToEndAction.mockResolvedValueOnce({ ok: true, data: null }).mockResolvedValueOnce({ ok: false, code: "FORBIDDEN", message: "No" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Drag Task a" })));
    (document.activeElement as HTMLElement).blur();
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b to Done" }));
    await waitFor(() => expect(status()).toContain("restored"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Drag Task b" })));
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

describe("KanbanBoard across pipelines", () => {
  const switcher = {
    boardId: "b",
    pipelineId: "p1",
    pipelines: [
      { id: "p1", name: "Launch plan", taskCount: 3, stages: [{ id: "todo", name: "To do" }, { id: "done", name: "Done" }] },
      { id: "p2", name: "Backlog", taskCount: 1, stages: [{ id: "ideas", name: "Ideas" }, { id: "ready", name: "Ready" }] },
      { id: "p3", name: "Empty", taskCount: 0, stages: [] },
    ],
  };

  it("links every pipeline with its count and marks the current one", () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    const nav = screen.getByRole("navigation", { name: "Pipelines" });
    expect(within(nav).getByRole("link", { name: "Launch plan, 3 tasks" }).getAttribute("aria-current")).toBe("page");
    const backlog = within(nav).getByRole("link", { name: "Backlog, 1 task" });
    expect(backlog.getAttribute("href")).toBe("/boards/b/pipelines/p2");
    expect(backlog.getAttribute("aria-current")).toBeNull();
  });

  it("offers the stages of the other pipelines in the Move menu, under their own names, and keeps the same-pipeline names", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    expect(screen.getByRole("button", { name: "Move Task a to Done" })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Backlog pipeline" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Move Task a to Backlog / Ideas", "Move Task a to Backlog / Ready"]);
    expect(screen.queryByRole("group", { name: "Empty pipeline" })).toBeNull();
  });

  it("moves across pipelines through the server first, then refreshes the page and announces it", async () => {
    const pending = deferred();
    moveTaskToEndAction.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Backlog / Ready" }));
    expect(sent(0, moveTaskToEndAction)).toEqual({ taskId: "a", toStageId: "ready" });
    expect(titles("To do")).toEqual(["Task a", "Task b"]); // not optimistic
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, data: null }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(status()).toBe("Moved Task a to Ready in Backlog");
  });

  it("dropping a card on another pipeline's tab moves it to that pipeline's first stage", async () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p2" } }));
    expect(sent(0, moveTaskToEndAction)).toEqual({ taskId: "a", toStageId: "ideas" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(status()).toBe("Moved Task a to Ideas in Backlog");
  });

  it("ignores a drop on the current pipeline's tab or on a pipeline without stages", async () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p1" } }));
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p3" } }));
    expect(moveTaskToEndAction).not.toHaveBeenCalled();
    expect(moveTaskAction).not.toHaveBeenCalled();
  });

  it("keeps the card, says why and re-reads the page when the server refuses", async () => {
    moveTaskToEndAction.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p2" } }));
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    expect(status()).toContain("Resource not found");
    expect(status()).toContain("Couldn't move Task a");
    expect(status()).not.toContain("restored"); // nothing was shown optimistically, so nothing is put back
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a second drop while a move across pipelines is in flight, and says the board is busy", async () => {
    const pending = deferred();
    moveTaskToEndAction.mockReturnValue(pending.promise);
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    const busy = () => screen.getByRole("status", { name: "Board updates" }).getAttribute("aria-busy");
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p2" } }));
    await act(async () => dnd.props!.onDragEnd({ active: { id: "b" }, over: { id: "pipeline:p2" } }));
    expect(moveTaskToEndAction).toHaveBeenCalledTimes(1);
    expect(busy()).toBe("true");
    await act(async () => pending.resolve({ ok: true, data: null }));
    expect(busy()).toBeNull();
    await act(async () => dnd.props!.onDragEnd({ active: { id: "b" }, over: { id: "pipeline:p2" } }));
    expect(moveTaskToEndAction).toHaveBeenCalledTimes(2);
  });

  it("waits for a pending move inside the pipeline before sending a move across", async () => {
    const first = deferred();
    moveTaskToEndAction.mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await user.click(screen.getByLabelText("Move options for Task a"));
    await user.click(screen.getByRole("button", { name: "Move Task a to Done" }));
    await act(async () => dnd.props!.onDragEnd({ active: { id: "b" }, over: { id: "pipeline:p2" } }));
    expect(moveTaskToEndAction).toHaveBeenCalledTimes(1); // the cross move is queued behind it
    await act(async () => first.resolve({ ok: true, data: null }));
    await waitFor(() => expect(moveTaskToEndAction).toHaveBeenCalledTimes(2));
    expect(sent(1, moveTaskToEndAction)).toEqual({ taskId: "b", toStageId: "ideas" });
  });

  it("puts focus on the destination tab after a move across, and back on the card when it was refused", async () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p2" } }));
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Backlog, 1 task" }));
    moveTaskToEndAction.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    await act(async () => dnd.props!.onDragEnd({ active: { id: "b" }, over: { id: "pipeline:p2" } }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Drag Task b" }));
  });

  it("drops the old refusal from the status once a later move succeeds", async () => {
    moveTaskToEndAction.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite switcher={switcher} {...props} />);
    await act(async () => dnd.props!.onDragEnd({ active: { id: "a" }, over: { id: "pipeline:p2" } }));
    expect(status()).toContain("Resource not found");
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b up" }));
    await waitFor(() => expect(status()).not.toContain("Resource not found"));
  });

  it("gives viewers plain links to the pipelines and no move controls", () => {
    render(<KanbanBoard columns={columns()} canWrite={false} switcher={switcher} {...props} />);
    expect(screen.getByRole("link", { name: "Backlog, 1 task" })).toBeTruthy();
    expect(screen.queryByLabelText("Move options for Task a")).toBeNull();
    expect(screen.queryByRole("button", { name: /Drag/ })).toBeNull();
  });

  it("shows no tabs when the board has a single pipeline", () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={{ ...switcher, pipelines: [switcher.pipelines[0]!] }} {...props} />);
    expect(screen.queryByRole("navigation", { name: "Pipelines" })).toBeNull();
  });
});
