// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ createTaskAction: vi.fn(), updateTaskAction: vi.fn(), deleteTaskAction: vi.fn() }));
vi.mock("@/app/_actions/tasks", () => actions);

const { CreateTaskForm } = await import("@/components/kanban/create-task-form");

const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const STAGES = [{ id: "s1", name: "To do" }, { id: "s2", name: "Done" }];
const MEMBERS = [{ userId: "u1", name: "Olivia" }, { userId: "u2", name: "Mark" }];

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("CreateTaskForm", () => {
  it("offers the stages, priorities and board members, and starts on the first stage with medium priority", () => {
    render(<CreateTaskForm stages={STAGES} members={MEMBERS} />);
    expect([...(screen.getByLabelText("Stage") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["To do", "Done"]);
    const priority = screen.getByLabelText("Priority") as HTMLSelectElement;
    expect([...priority.options].map((o) => o.textContent)).toEqual(["Low", "Medium", "High"]);
    expect(priority.value).toBe("medium");
    expect([...(screen.getByLabelText("Assignee") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Unassigned", "Olivia", "Mark"]);
  });

  it("submits everything the visitor filled in", async () => {
    const user = userEvent.setup();
    render(<CreateTaskForm stages={STAGES} members={MEMBERS} />);
    await user.type(screen.getByLabelText("Title"), "Ship it");
    await user.type(screen.getByLabelText("Description"), "Before Friday");
    await user.selectOptions(screen.getByLabelText("Stage"), "s2");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await user.type(screen.getByLabelText("Due date"), "2026-12-01");
    await user.selectOptions(screen.getByLabelText("Assignee"), "u2");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(actions.createTaskAction).toHaveBeenCalled());
    expect(fields(actions.createTaskAction.mock.calls[0]![1])).toEqual({
      stageId: "s2", title: "Ship it", description: "Before Friday", priority: "high", dueDate: "2026-12-01", assigneeId: "u2",
    });
  });

  it("links field errors to their inputs", async () => {
    actions.createTaskAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { title: ["Too small"], dueDate: ["Invalid date"] } });
    const user = userEvent.setup();
    render(<CreateTaskForm stages={STAGES} members={MEMBERS} />);
    await user.type(screen.getByLabelText("Title"), " ");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByText("Too small")).toBeTruthy();
    expect(screen.getByLabelText("Title").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Due date").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("shows the guest task limit as a readable message", async () => {
    actions.createTaskAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Guest limit reached: at most 200 tasks. Sign up to create more." });
    const user = userEvent.setup();
    render(<CreateTaskForm stages={STAGES} members={MEMBERS} />);
    await user.type(screen.getByLabelText("Title"), "One more");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("Guest limit reached: at most 200 tasks. Sign up to create more.");
  });

  it("cannot be used on a pipeline without stages", () => {
    render(<CreateTaskForm stages={[]} members={MEMBERS} />);
    expect(screen.getByText(/add a stage first/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  });
});
