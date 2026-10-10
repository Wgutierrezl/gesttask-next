import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getActor = vi.fn();
const useCases = { getTask: vi.fn(), getPipeline: vi.fn(), listStages: vi.fn(), listMemberProfiles: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger: { error: vi.fn() } }) }));

const { default: TaskPage } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]/page");

const BOARD = "00000000-0000-4000-8000-000000000001";
const PIPELINE = "00000000-0000-4000-8000-000000000002";
const TASK = "00000000-0000-4000-8000-000000000003";
const params = (over: Partial<Record<"boardId" | "pipelineId" | "taskId", string>> = {}) => Promise.resolve({ boardId: BOARD, pipelineId: PIPELINE, taskId: TASK, ...over });
const task = (over: Record<string, unknown> = {}) => ({
  id: TASK, boardId: BOARD, pipelineId: PIPELINE, stageId: "s1", title: "Ship the release", description: "Cut the tag\nand announce", priority: "high", status: "active",
  dueDate: "2026-10-01", assigneeId: "u1", completedAt: null, position: "a0", createdAt: new Date("2026-09-20T00:00:00Z"), overdue: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u1", isGuest: false });
  useCases.getTask.mockResolvedValue(task());
  useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "owner" });
  useCases.listStages.mockResolvedValue([{ id: "s1", name: "To do", isDone: false }, { id: "s2", name: "Done", isDone: true }]);
  useCases.listMemberProfiles.mockResolvedValue([{ userId: "u1", role: "owner", name: "Olivia", email: null }]);
});

describe("TaskPage", () => {
  it("shows the task with its stage, priority, overdue state and assignee, and the edit and delete forms to writers", async () => {
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Ship the release");
    expect(html).toContain("To do");
    expect(html).toContain("High");
    expect(html).toContain("Due Oct 1, 2026");
    expect(html).toContain("Overdue");
    expect(html).toContain("Olivia");
    expect(html).toContain("Cut the tag");
    expect(html).toContain("Edit task");
    expect(html).toContain("Delete task");
    expect(html).toContain("Move to stage");
    expect(html).toContain(`href="/boards/${BOARD}/pipelines/${PIPELINE}"`);
  });

  it("shows when a done task was completed and no overdue badge", async () => {
    useCases.getTask.mockResolvedValue(task({ stageId: "s2", completedAt: new Date("2026-10-09T10:00:00Z"), overdue: false }));
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Completed Oct 9, 2026");
    expect(html).toContain("Done stage");
    expect(html).not.toContain("Overdue");
  });

  it("names an unassigned task and a former member honestly", async () => {
    useCases.getTask.mockResolvedValue(task({ assigneeId: null }));
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).toContain("Unassigned");
    useCases.getTask.mockResolvedValue(task({ assigneeId: "gone" }));
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).toContain("Former member");
  });

  it("looks the assignee up by id, so a member beyond the first 200 is still named and kept in the edit form", async () => {
    useCases.getTask.mockResolvedValue(task({ assigneeId: "far" }));
    useCases.listMemberProfiles.mockImplementation(async (input: { userIds?: string[] }) =>
      input.userIds ? [{ userId: "far", role: "member", name: "Far Away", email: null }] : [{ userId: "u1", role: "owner", name: "Olivia", email: null }],
    );
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Far Away");
    expect(html).not.toContain("Former member");
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: BOARD, userIds: ["far"] });
    expect(html).toContain('<option value="far" selected="">Far Away</option>');
  });

  it("is read-only for viewers", async () => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Ship the release");
    expect(html).not.toContain("Edit task");
    expect(html).not.toContain("Delete task");
    expect(html).not.toContain("Move to stage");
  });

  it.each([
    ["a foreign task", () => useCases.getTask.mockRejectedValue(new NotFoundError())],
    ["a malformed id", () => useCases.getTask.mockRejectedValue(new ValidationError())],
  ])("renders 404 for %s without reading anything else", async (_name, arrange) => {
    arrange();
    await expect(TaskPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.getPipeline).not.toHaveBeenCalled();
    expect(useCases.listMemberProfiles).not.toHaveBeenCalled();
  });

  it("renders 404 when the URL names another board or pipeline than the task's", async () => {
    await expect(TaskPage({ params: params({ boardId: "00000000-0000-4000-8000-0000000000aa" }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(TaskPage({ params: params({ pipelineId: "00000000-0000-4000-8000-0000000000bb" }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.listMemberProfiles).not.toHaveBeenCalled();
  });

  it("checks the session first", async () => {
    getActor.mockResolvedValue(null);
    await expect(TaskPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.getTask).not.toHaveBeenCalled();
  });
});
