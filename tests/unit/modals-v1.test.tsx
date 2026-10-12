// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "lucide-react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/app/_actions/boards", () => ({ createBoardAction: async () => undefined }));
vi.mock("@/app/_actions/tasks", () => ({ createTaskAction: async () => undefined, updateTaskAction: async () => undefined, deleteTaskAction: async () => undefined, moveTaskAction: async () => undefined }));
vi.mock("@/app/_actions/comments", () => ({ createCommentAction: async () => undefined, updateCommentAction: async () => undefined, deleteCommentAction: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }) }));

const { Field, Input } = await import("@/components/ui/field");
const { CreateBoardForm } = await import("@/components/boards/create-board-form");
const { CreateTaskForm } = await import("@/components/kanban/create-task-form");
const { TaskActions } = await import("@/components/kanban/task-actions");
const { TaskDetailsCard, TaskDescription } = await import("@/app/_shared/task-detail");
const { CommentsSection } = await import("@/components/comments/comments-section");

afterEach(cleanup);
const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));

const decorative = (root: Element) => root.querySelectorAll('svg[aria-hidden="true"]');

describe("Field labelIcon", () => {
  it("puts a decorative icon before the label text without changing the label's accessible name", () => {
    render(<Field label="Due date" labelIcon={<Calendar />}><Input name="due" /></Field>);
    const label = screen.getByText("Due date").closest("label")!;
    expect(decorative(label)).toHaveLength(1);
    expect(screen.getByLabelText("Due date")).toBeTruthy();
  });

  it("adds nothing without one", () => {
    render(<Field label="Due date"><Input name="due" /></Field>);
    expect(decorative(screen.getByText("Due date").closest("label")!)).toHaveLength(0);
  });
});

describe("Create board form like v1", () => {
  it("guides the name and the description with placeholders", () => {
    render(<CreateBoardForm />);
    expect(screen.getByLabelText(/^Name/).getAttribute("placeholder")).toBe("e.g. Digital marketing project");
    expect(screen.getByLabelText("Description").getAttribute("placeholder")).toBe("Describe the purpose of this board...");
  });

  it("speaks Spanish", () => {
    render(<CreateBoardForm />, { locale: "es" });
    expect(screen.getByLabelText(/^Nombre/).getAttribute("placeholder")).toBe("Ej: Proyecto de marketing digital");
  });
});

describe("Create task form like v1", () => {
  const stages = [{ id: "s1", name: "To do" }];
  const members = [{ userId: "u1", name: "Olivia" }];

  it("shows icons on priority, assignee and due date and placeholders on title and description", () => {
    render(<CreateTaskForm stages={stages} members={members} />);
    for (const name of ["Assignee", "Due date"]) expect(decorative(screen.getByText(name).closest("label")!)).toHaveLength(1);
    expect(decorative(screen.getByText("Priority").closest("legend")!)).toHaveLength(1);
    expect(screen.getByLabelText("Title").getAttribute("placeholder")).toBe("e.g. Implement authentication");
    expect(screen.getByLabelText("Description").getAttribute("placeholder")).toBe("Describe the details of the task...");
  });

  it("keeps the fields' accessible names so they stay reachable by label", () => {
    render(<CreateTaskForm stages={stages} members={members} />);
    for (const name of ["Stage", "Title", "Description", "Due date", "Assignee"]) expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Priority" })).toBeTruthy();
  });
});

describe("TaskActions icon-only", () => {
  const task = { id: "t1", title: "Ship", description: "", priority: "high" as const, dueDate: null, assigneeId: null };

  it("renders Edit and Delete as icon buttons that keep their names and a tooltip", () => {
    render(<TaskActions task={task} members={[]} iconOnly />);
    const edit = screen.getByRole("button", { name: "Edit" });
    const del = screen.getByRole("button", { name: "Delete" });
    expect(edit.textContent).toBe("");
    expect(del.textContent).toBe("");
    expect(edit.getAttribute("title")).toBe("Edit");
    expect(decorative(edit)).toHaveLength(1);
  });

  it("still opens the same dialogs", async () => {
    render(<TaskActions task={task} members={[]} iconOnly />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeTruthy();
  });

  it("keeps the labelled buttons by default", () => {
    render(<TaskActions task={task} members={[]} />);
    expect(screen.getByRole("button", { name: "Edit" }).textContent).toBe("Edit");
  });
});

describe("task detail like v1", () => {
  const detail = (over: Record<string, unknown> = {}) =>
    ({
      task: { priority: "high", assigneeId: "u1", dueDate: "2026-10-16", overdue: false, completedAt: new Date("2026-10-18T20:49:00Z"), createdAt: new Date("2026-10-12T10:00:00Z"), ...over },
      stage: { name: "In progress", isDone: false },
      assignee: "Camila Torres",
    }) as never;

  it("shows four boxes (priority, stage, assignee, due date) with icons, and the dates under them", () => {
    render(<TaskDetailsCard detail={detail()} level={3} />);
    const boxes = screen.getAllByRole("term").map((term) => term.closest("div")!);
    expect(boxes.slice(0, 4).map((box) => within(box).getAllByRole("term")[0]!.textContent)).toEqual(["Priority", "Stage", "Assignee", "Due date"]);
    for (const box of boxes.slice(0, 4)) expect(decorative(box).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Camila Torres")).toBeTruthy();
    expect(screen.getByText("Due Oct 16, 2026")).toBeTruthy();
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Oct 12, 2026")).toBeTruthy();
    expect(screen.getByText("Completed", { selector: "dt" })).toBeTruthy();
  });

  it("omits the completed date of an open task and keeps a hidden Details heading for the outline", () => {
    render(<TaskDetailsCard detail={detail({ completedAt: null })} level={3} />);
    expect(screen.queryByText("Completed", { selector: "dt" })).toBeNull();
    const heading = screen.getByRole("heading", { level: 3, name: "Details" });
    expect(heading.className).toContain("sr-only");
  });

  it("shows the description as plain text, not in a box", () => {
    const { container } = render(<TaskDescription description="Define the tokens" />);
    expect(screen.getByText("Define the tokens").tagName).toBe("P");
    expect(container.querySelector(".border")).toBeNull();
  });
});

describe("comments like v1", () => {
  it("heads the section with an icon", () => {
    render(<CommentsSection taskId="t1" comments={[]} truncated={false} loadCap={200} canAttach demoGuest={false} />);
    const heading = screen.getByRole("heading", { name: "Comments (0)" });
    expect(decorative(heading.parentElement!)).toHaveLength(1);
  });
});
