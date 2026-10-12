// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnView, TaskCardView } from "@/components/kanban/types";

const moveTaskAction = vi.hoisted(() => vi.fn());
const moveTaskToEndAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/tasks", () => ({ moveTaskAction, moveTaskToEndAction }));
const stageActions = vi.hoisted(() => ({ createStageAction: vi.fn(), renameStageAction: vi.fn(), reorderStageAction: vi.fn(), setStageDoneAction: vi.fn(), deleteStageAction: vi.fn() }));
vi.mock("@/app/_actions/stages", () => stageActions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const dnd = vi.hoisted(() => ({ props: undefined as undefined | { onDragEnd: (event: unknown) => void; accessibility?: { announcements: { onDragStart: (e: unknown) => string } } } }));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return { ...actual, DndContext: (props: never) => ((dnd.props = props), createElement(actual.DndContext, props)) };
});

const proto = HTMLDialogElement.prototype;
const originalDialog = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, originalDialog));

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

describe("KanbanBoard stage management", () => {
  const owner = { canWrite: true, canManageStages: true, pipelineId: "p1", ...props };

  it("gives the owner a stage menu in every column and a dashed Add stage column at the end, keeping the column names", () => {
    render(<KanbanBoard columns={columns()} {...owner} />);
    for (const name of ["To do", "Done"]) {
      expect(within(column(name)).getByRole("button", { name: `Stage options for ${name}` })).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: "To do, 2 tasks" })).toBeTruthy();
    const regions = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(regions.filter((label) => /, \d+ tasks?$/.test(label ?? ""))).toEqual(["To do, 2 tasks", "Done, 1 task"]);
    const add = screen.getByRole("button", { name: "Add stage" });
    expect(screen.getAllByRole("region").some((region) => region.contains(add))).toBe(false);
  });

  it("tells each menu which neighbour its stage goes after, so moves are relative", async () => {
    render(<KanbanBoard columns={columns()} {...owner} />);
    await userEvent.click(within(column("Done")).getByRole("button", { name: "Stage options for Done" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move left" }));
    await waitFor(() => expect(stageActions.reorderStageAction).toHaveBeenCalled());
    expect(Object.fromEntries([...(stageActions.reorderStageAction.mock.calls[0]![1] as FormData).entries()])).toEqual({ stageId: "done", afterStageId: "" });
  });

  it("moves the focus to the next column's menu button once a deleted stage is gone, or to Add stage after the last one", async () => {
    stageActions.deleteStageAction.mockResolvedValue({ ok: true, data: null });
    const three = (): ColumnView[] => [...columns(), { stage: { id: "extra", name: "Extra", isDone: false }, tasks: [] }];
    const { rerender } = render(<KanbanBoard columns={three()} {...owner} />);
    await userEvent.click(within(column("To do")).getByRole("button", { name: "Stage options for To do" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete stage" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete stage" }));
    await waitFor(() => expect(stageActions.deleteStageAction).toHaveBeenCalled());
    rerender(<KanbanBoard columns={three().slice(1)} {...owner} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stage options for Done" })));

    await userEvent.click(screen.getByRole("button", { name: "Stage options for Extra" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete stage" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete stage" }));
    await waitFor(() => expect(stageActions.deleteStageAction).toHaveBeenCalledTimes(2));
    rerender(<KanbanBoard columns={three().slice(1, 2)} {...owner} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add stage" })));
  });

  it("creates a stage from the Add stage column", async () => {
    stageActions.createStageAction.mockResolvedValue({ ok: true, data: null });
    render(<KanbanBoard columns={columns()} {...owner} />);
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    await userEvent.type(screen.getByLabelText("Stage name"), "Review{Enter}");
    await waitFor(() => expect(stageActions.createStageAction).toHaveBeenCalled());
    expect(Object.fromEntries([...(stageActions.createStageAction.mock.calls[0]![1] as FormData).entries()])).toEqual({ pipelineId: "p1", name: "Review" });
  });

  it("offers an empty board's owner the Add stage column", () => {
    render(<KanbanBoard columns={[]} {...owner} />);
    expect(screen.getByRole("button", { name: "Add stage" })).toBeTruthy();
  });

  it("gives members who can write tasks, and viewers, plain headers with no menu and no Add stage", () => {
    const { unmount } = render(<KanbanBoard columns={columns()} canWrite {...props} pipelineId="p1" />);
    expect(screen.queryByRole("button", { name: /Stage options/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add stage" })).toBeNull();
    expect(within(column("To do")).getByRole("heading", { level: 3, name: "To do" })).toBeTruthy();
    unmount();
    render(<KanbanBoard columns={columns()} canWrite={false} canManageStages pipelineId="p1" {...props} />);
    expect(screen.queryByRole("button", { name: /Stage options/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add stage" })).toBeNull();
    expect(within(column("To do")).getByTestId("column-count").textContent).toBe("2");
  });
});

describe("KanbanBoard task creation", () => {
  it("gives writers an add button at the bottom of each column, named after the stage", () => {
    render(<KanbanBoard columns={columns()} canWrite members={[{ userId: "u1", name: "Olivia" }]} {...props} />);
    for (const name of ["To do", "Done"]) {
      expect(within(column(name)).getByRole("button", { name: `Add task to ${name}` })).toBeTruthy();
    }
  });

  it("gives viewers none, and writers none when the page offers no members to assign", () => {
    const { unmount } = render(<KanbanBoard columns={columns()} canWrite={false} members={[{ userId: "u1", name: "Olivia" }]} {...props} />);
    expect(screen.queryByRole("button", { name: /^Add task to/ })).toBeNull();
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    unmount();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    expect(screen.queryByRole("button", { name: /^Add task to/ })).toBeNull();
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
  });
});

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
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("article", { name: "Drag Task a" })));
    (document.activeElement as HTMLElement).blur();
    await user.click(screen.getByLabelText("Move options for Task b"));
    await user.click(screen.getByRole("button", { name: "Move Task b to Done" }));
    await waitFor(() => expect(status()).toContain("restored"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("article", { name: "Drag Task b" })));
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

  it("makes the whole card the keyboard-focusable draggable: it announces itself as sortable, is named after its title, and has no Drag or Move button", () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const card = screen.getByRole("article", { name: "Drag Task a" });
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.getAttribute("aria-roledescription")).toBe("sortable");
    expect(within(card).getByRole("heading", { level: 4 }).textContent).toBe("Task a");
    expect(screen.queryByRole("button", { name: /^Drag/ })).toBeNull();
    expect(screen.queryByText("Drag")).toBeNull();
    expect(screen.queryByText("Move")).toBeNull();
    expect(within(card).getByLabelText("Move options for Task a").textContent).toBe("");
    expect(dnd.props!.accessibility!.announcements.onDragStart({ active: { id: "a" } })).toBe("Picked up Task a.");
  });
});

describe("KanbanBoard dragging by the card body", () => {
  const scroller = () => screen.getByTestId("board-scroller");
  const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", target: Element | Document, x: number, y: number, pointerType = "mouse") =>
    fireEvent[type](target, { pointerId: 1, pointerType, isPrimary: true, button: 0, buttons: type === "pointerUp" ? 0 : 1, clientX: x, clientY: y });

  it("starts a drag when a pointer grabbed anywhere on the card moves past the threshold, and ends it on release", async () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const body = screen.getByRole("article", { name: "Drag Task a" });
    pointer("pointerDown", body, 20, 20);
    pointer("pointerMove", document, 22, 22);
    expect(scroller().getAttribute("data-dragging")).toBe("false");
    pointer("pointerMove", document, 40, 40);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("true"));
    pointer("pointerUp", document, 40, 40);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("false"));
  });

  it("starts a drag from the title link too, but a plain click never drags", async () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const link = screen.getByRole("link", { name: "Task a" });
    expect(link.getAttribute("draggable")).toBe("false");
    pointer("pointerDown", link, 10, 10);
    pointer("pointerUp", link, 10, 10);
    expect(scroller().getAttribute("data-dragging")).toBe("false");
    pointer("pointerDown", link, 10, 10);
    pointer("pointerMove", document, 30, 30);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("true"));
    pointer("pointerUp", document, 30, 30);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("false"));
  });

  it("does not start a drag from a touch pointer: touch has its own delayed sensor, so scrolling the board works", () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const body = screen.getByRole("article", { name: "Drag Task a" });
    pointer("pointerDown", body, 20, 20, "touch");
    pointer("pointerMove", document, 60, 60, "touch");
    expect(scroller().getAttribute("data-dragging")).toBe("false");
  });

  it("does not start a drag from the options button, so opening its menu is never mistaken for a grab", () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const options = screen.getByLabelText("Move options for Task a");
    pointer("pointerDown", options, 20, 20);
    pointer("pointerMove", document, 60, 60);
    expect(scroller().getAttribute("data-dragging")).toBe("false");
  });

  it("cancels the click that ends a drag on the card it started from, so the link under the pointer does not navigate, and only that one", async () => {
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    const body = screen.getByRole("article", { name: "Drag Task a" });
    expect(fireEvent.click(body)).toBe(true); // before any drag: an ordinary click goes through
    pointer("pointerDown", body, 20, 20);
    pointer("pointerMove", document, 40, 40);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("true"));
    pointer("pointerUp", document, 20, 20);
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("false"));
    expect(fireEvent.click(body)).toBe(false); // the release click is swallowed (default prevented, so no hard navigation)
    await waitFor(() => expect(fireEvent.click(body)).toBe(true)); // and the next real click is not
  });

  it("starts a keyboard drag from the focused card, not from the controls inside it", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    screen.getByLabelText("Move options for Task a").focus();
    await user.keyboard("{Escape}");
    expect(scroller().getAttribute("data-dragging")).toBe("false");
    screen.getByRole("article", { name: "Drag Task a" }).focus();
    await user.keyboard(" ");
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("true"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(scroller().getAttribute("data-dragging")).toBe("false"));
  });

  it("shows the dragged card in the overlay at the width of its source, hidden from assistive tech", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard columns={columns()} canWrite {...props} />);
    screen.getByRole("article", { name: "Drag Task a" }).focus();
    await user.keyboard(" ");
    const overlay = await screen.findByTestId("drag-overlay");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(within(overlay).getByRole("heading", { level: 4, hidden: true }).textContent).toBe("Task a");
    expect(within(overlay).queryByLabelText(/Move options/)).toBeNull();
  });
});

describe("KanbanBoard for viewers", () => {
  it("shows the columns without drag handles or move menus", () => {
    render(<KanbanBoard columns={columns()} canWrite={false} {...props} />);
    expect(titles("To do")).toEqual(["Task a", "Task b"]);
    expect(screen.queryByRole("article", { name: /Drag/ })).toBeNull();
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
    expect(document.activeElement).toBe(screen.getByRole("article", { name: "Drag Task b" }));
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
    expect(screen.queryByRole("article", { name: /Drag/ })).toBeNull();
  });

  it("shows no tabs when the board has a single pipeline", () => {
    render(<KanbanBoard columns={columns()} canWrite switcher={{ ...switcher, pipelines: [switcher.pipelines[0]!] }} {...props} />);
    expect(screen.queryByRole("navigation", { name: "Pipelines" })).toBeNull();
  });
});
