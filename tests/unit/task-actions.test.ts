import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
const useCases = { createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger: { error: vi.fn() } }) }));

const actions = await import("@/app/_actions/tasks");
const { pipelinePath } = await import("@/app/_shared/paths");
const PIPELINE_PAGE = "/boards/[boardId]/pipelines/[pipelineId]";
const TASK_PAGE = "/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]";
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());
const refreshed = () => revalidatePath.mock.calls.map(([path]) => path);

beforeEach(() => vi.clearAllMocks());

describe("pipelinePath", () => {
  it("builds the Kanban path from two ids and falls back to the board list for anything else", () => {
    expect(pipelinePath(ID(1), ID(2))).toBe(`/boards/${ID(1)}/pipelines/${ID(2)}`);
    for (const [b, p] of [["../x", ID(2)], [ID(1), "//evil.example"], ["", ""], [ID(1), `${ID(2)}/../..`]] as const) expect(pipelinePath(b, p)).toBe("/boards");
  });
});

describe("createTaskAction", () => {
  it("creates the task with empty optional fields as defaults and null, and refreshes the Kanban page", async () => {
    expect(await actions.createTaskAction(undefined, form({ stageId: ID(3), title: "Write docs", description: "", priority: "high", dueDate: "", assigneeId: "" }))).toEqual({ ok: true, data: null });
    expect(useCases.createTask).toHaveBeenCalledWith({ stageId: ID(3), title: "Write docs", description: "", priority: "high", dueDate: null, assigneeId: null });
    expect(refreshed()).toEqual([PIPELINE_PAGE]);
  });

  it("passes the due date and assignee when given, and lets the use case default a missing priority", async () => {
    await actions.createTaskAction(undefined, form({ stageId: ID(3), title: "t", dueDate: "2026-12-01", assigneeId: "user-1" }));
    expect(useCases.createTask).toHaveBeenCalledWith({ stageId: ID(3), title: "t", description: "", priority: undefined, dueDate: "2026-12-01", assigneeId: "user-1" });
  });

  it("returns the guest task limit as a readable conflict and refreshes nothing", async () => {
    useCases.createTask.mockRejectedValue(new ConflictError("Guest limit reached: at most 200 tasks. Sign up to create more."));
    expect(await actions.createTaskAction(undefined, form({ stageId: ID(3), title: "t" }))).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("Sign up to create more") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns field errors", async () => {
    useCases.createTask.mockRejectedValue(new ValidationError("Invalid input", { title: ["Too small"] }));
    expect(await actions.createTaskAction(undefined, form({ stageId: ID(3), title: "" }))).toMatchObject({ fieldErrors: { title: ["Too small"] } });
  });
});

describe("updateTaskAction", () => {
  it("sends every editable field, clearing the due date and assignee when emptied, and refreshes both pages", async () => {
    await actions.updateTaskAction(undefined, form({ taskId: ID(4), title: "New", description: "d", priority: "low", dueDate: "", assigneeId: "" }));
    expect(useCases.updateTask).toHaveBeenCalledWith({ taskId: ID(4), title: "New", description: "d", priority: "low", dueDate: null, assigneeId: null });
    expect(refreshed()).toEqual([PIPELINE_PAGE, TASK_PAGE]);
  });

  it("answers NotFound as state for a foreign task", async () => {
    useCases.updateTask.mockRejectedValue(new NotFoundError());
    expect(await actions.updateTaskAction(undefined, form({ taskId: ID(4), title: "x" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("deleteTaskAction", () => {
  const entries = { taskId: ID(4), boardId: ID(1), pipelineId: ID(2) };

  it("needs the confirmation, server side too", async () => {
    expect(await actions.deleteTaskAction(undefined, form(entries))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { confirm: [expect.any(String)] } });
    expect(useCases.deleteTask).not.toHaveBeenCalled();
  });

  it("deletes, refreshes both pages and returns to the Kanban", async () => {
    const digest = await actions.deleteTaskAction(undefined, form({ ...entries, confirm: "yes" })).then(() => "", (e: { digest: string }) => e.digest);
    expect(useCases.deleteTask).toHaveBeenCalledWith({ taskId: ID(4) });
    expect(refreshed()).toEqual([PIPELINE_PAGE, TASK_PAGE]);
    expect(digest).toContain(`/boards/${ID(1)}/pipelines/${ID(2)}`);
  });

  it("does not follow a tampered return address out of the app", async () => {
    const digest = await actions.deleteTaskAction(undefined, form({ ...entries, boardId: "//evil.example", confirm: "yes" })).then(() => "", (e: { digest: string }) => e.digest);
    expect(digest).toContain("/boards;");
  });
});
