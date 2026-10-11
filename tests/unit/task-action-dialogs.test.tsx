// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ updateTaskAction: vi.fn(), deleteTaskAction: vi.fn() }));
vi.mock("@/app/_actions/tasks", () => actions);

const { TaskActions } = await import("@/components/kanban/task-actions");

const TASK = { id: "t1", title: "Ship", description: "Soon", priority: "high" as const, dueDate: "2026-12-01", assigneeId: "u2" };
const MEMBERS = [{ userId: "u1", name: "Olivia" }, { userId: "u2", name: "Mark" }];
const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
beforeEach(() => {
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskActions", () => {
  it("opens the edit form in a modal, starting from the task's values, and closes it after saving", async () => {
    const user = userEvent.setup();
    render(<TaskActions task={TASK} members={MEMBERS} />);
    expect(screen.queryByLabelText("Title")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit task" });
    expect((within(dialog).getByLabelText("Title") as HTMLInputElement).value).toBe("Ship");
    expect((within(dialog).getByRole("radio", { name: "High" }) as HTMLInputElement).checked).toBe(true);
    await user.clear(within(dialog).getByLabelText("Title"));
    await user.type(within(dialog).getByLabelText("Title"), "Ship it");
    await user.click(within(dialog).getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(actions.updateTaskAction).toHaveBeenCalled());
    expect(fields(actions.updateTaskAction.mock.calls[0]![1])).toMatchObject({ taskId: "t1", title: "Ship it", priority: "high" });
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
  });

  it("keeps the edit modal open with the error when saving fails, and Cancel closes it without saving", async () => {
    actions.updateTaskAction.mockResolvedValueOnce({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { title: ["Too small"] } });
    const user = userEvent.setup();
    render(<TaskActions task={TASK} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save task" }));
    expect(await screen.findByText("Too small")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(actions.updateTaskAction).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation in a modal before deleting, and sends only the task id", async () => {
    const user = userEvent.setup();
    render(<TaskActions task={TASK} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete task" });
    expect(within(dialog).getByText(/Delete .Ship.\? This cannot be undone/)).toBeTruthy();
    await user.click(within(dialog).getByLabelText(/delete this task/i));
    await user.click(within(dialog).getByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(actions.deleteTaskAction).toHaveBeenCalled());
    expect(fields(actions.deleteTaskAction.mock.calls[0]![1])).toEqual({ taskId: "t1", confirm: "yes" });
  });

  it("backs out of deleting with Cancel", async () => {
    const user = userEvent.setup();
    render(<TaskActions task={TASK} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete task" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/delete this task/i)).toBeNull();
    expect(actions.deleteTaskAction).not.toHaveBeenCalled();
  });
});
