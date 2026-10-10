// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ createTaskAction: vi.fn(), updateTaskAction: vi.fn(), deleteTaskAction: vi.fn(), moveTaskToEndAction: vi.fn() }));
vi.mock("@/app/_actions/tasks", () => actions);

const { CreateTaskForm } = await import("@/components/kanban/create-task-form");
const { EditTaskForm } = await import("@/components/kanban/edit-task-form");
const { MoveTaskForm } = await import("@/components/kanban/move-task-form");
const { DeleteTaskForm } = await import("@/components/kanban/delete-task-form");

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

describe("EditTaskForm", () => {
  const TASK = { id: "t1", title: "Ship", description: "Soon", priority: "high" as const, dueDate: "2026-12-01", assigneeId: "u2" };

  it("starts from the task's current values and submits the task id with the edits", async () => {
    const user = userEvent.setup();
    render(<EditTaskForm task={TASK} members={MEMBERS} />);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Ship");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("high");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-12-01");
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("u2");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Ship it");
    await user.clear(screen.getByLabelText("Due date"));
    await user.selectOptions(screen.getByLabelText("Assignee"), "");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(actions.updateTaskAction).toHaveBeenCalled());
    expect(fields(actions.updateTaskAction.mock.calls[0]![1])).toEqual({ taskId: "t1", title: "Ship it", description: "Soon", priority: "high", dueDate: "", assigneeId: "" });
  });

  it("keeps a former assignee out of the options instead of silently reassigning", () => {
    render(<EditTaskForm task={{ ...TASK, assigneeId: "gone" }} members={MEMBERS} />);
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("");
  });
});

describe("DeleteTaskForm", () => {
  it("needs the confirmation box and sends the ids it will return to", async () => {
    const user = userEvent.setup();
    render(<DeleteTaskForm taskId="t1" boardId="b1" pipelineId="p1" />);
    const box = screen.getByLabelText(/delete this task/i) as HTMLInputElement;
    expect(box.required).toBe(true);
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(actions.deleteTaskAction).toHaveBeenCalled());
    expect(fields(actions.deleteTaskAction.mock.calls[0]![1])).toEqual({ taskId: "t1", boardId: "b1", pipelineId: "p1", confirm: "yes" });
  });

  it("shows the server's confirmation error next to the box", async () => {
    actions.deleteTaskAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Confirmation required", fieldErrors: { confirm: ["Confirm that you want to delete this task"] } });
    const user = userEvent.setup();
    render(<DeleteTaskForm taskId="t1" boardId="b1" pipelineId="p1" />);
    const box = screen.getByLabelText(/delete this task/i) as HTMLInputElement;
    box.required = false;
    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(await screen.findByText("Confirm that you want to delete this task")).toBeTruthy();
  });
});

describe("MoveTaskForm", () => {
  it("starts on the task's own stage and sends the chosen one", async () => {
    const user = userEvent.setup();
    render(<MoveTaskForm taskId="t1" stages={STAGES} currentStageId="s1" />);
    const select = screen.getByLabelText("Move to stage") as HTMLSelectElement;
    expect(select.value).toBe("s1");
    await user.selectOptions(select, "s2");
    await user.click(screen.getByRole("button", { name: "Move task" }));
    await waitFor(() => expect(actions.moveTaskToEndAction).toHaveBeenCalled());
    expect(fields(actions.moveTaskToEndAction.mock.calls[0]![1])).toEqual({ taskId: "t1", toStageId: "s2" });
  });
});
