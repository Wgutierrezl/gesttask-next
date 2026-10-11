// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const createTaskAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/tasks", () => ({ createTaskAction }));

const { AddTaskButton } = await import("@/components/kanban/add-task-button");

const STAGES = [{ id: "s1", name: "To do" }, { id: "s2", name: "In progress" }];
const MEMBERS = [{ userId: "u1", name: "Olivia" }];
const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
beforeEach(() => createTaskAction.mockResolvedValue({ ok: true, data: null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddTaskButton", () => {
  it("is named after its stage and opens a Create task modal without showing the form before", async () => {
    render(<AddTaskButton stage={STAGES[1]!} stages={STAGES} members={MEMBERS} />);
    expect(screen.queryByLabelText("Title")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add task to In progress" }));
    expect(screen.getByRole("dialog", { name: "New task" })).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("preselects the column's stage but still lets the visitor pick another one", async () => {
    const user = userEvent.setup();
    render(<AddTaskButton stage={STAGES[1]!} stages={STAGES} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Add task to In progress" }));
    const select = screen.getByLabelText("Stage") as HTMLSelectElement;
    expect(select.value).toBe("s2");
    expect([...select.options].map((o) => o.textContent)).toEqual(["To do", "In progress"]);
    await user.type(screen.getByLabelText("Title"), "Plan the demo");
    await user.selectOptions(select, "s1");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(createTaskAction).toHaveBeenCalled());
    expect(fields(createTaskAction.mock.calls[0]![1])).toMatchObject({ stageId: "s1", title: "Plan the demo", priority: "medium" });
  });

  it("closes after a successful submit, and reopens with a clean form", async () => {
    const user = userEvent.setup();
    render(<AddTaskButton stage={STAGES[0]!} stages={STAGES} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Add task to To do" }));
    await user.type(screen.getByLabelText("Title"), "First");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Add task to To do" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
  });

  it("stays open and explains when the server refuses", async () => {
    createTaskAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Guest limit reached: at most 200 tasks. Sign up to create more." });
    const user = userEvent.setup();
    render(<AddTaskButton stage={STAGES[0]!} stages={STAGES} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Add task to To do" }));
    await user.type(screen.getByLabelText("Title"), "One more");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add task" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("Guest limit reached: at most 200 tasks. Sign up to create more.");
    expect(screen.getByRole("dialog", { name: "New task" })).toBeTruthy();
  });

  it("closes with Cancel without creating anything", async () => {
    const user = userEvent.setup();
    render(<AddTaskButton stage={STAGES[0]!} stages={STAGES} members={MEMBERS} />);
    await user.click(screen.getByRole("button", { name: "Add task to To do" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(createTaskAction).not.toHaveBeenCalled();
  });
});
