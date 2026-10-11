import { renderToStaticMarkupWithIntl as renderToStaticMarkup } from "@tests/support/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/domain/errors";

const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
vi.mock("next/navigation", () => ({ redirect, notFound, useRouter: () => ({ back: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getActor = vi.fn();
const useCases = { getTask: vi.fn(), getPipeline: vi.fn(), listStages: vi.fn(), listMemberProfiles: vi.fn(), listComments: vi.fn(), getBoardDashboard: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger: { error: vi.fn() } }) }));

const { default: TaskModalPage } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/(.)tasks/[taskId]/page");
const { default: ModalSlotDefault } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/default");
const { default: ModalSlotIdle } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/page");

const BOARD = "00000000-0000-4000-8000-000000000001";
const PIPELINE = "00000000-0000-4000-8000-000000000002";
const TASK = "00000000-0000-4000-8000-000000000003";
const params = (over: Partial<Record<"boardId" | "pipelineId" | "taskId", string>> = {}) => Promise.resolve({ boardId: BOARD, pipelineId: PIPELINE, taskId: TASK, ...over });
const pipeline = (role: string) => ({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u1", isGuest: false });
  useCases.getTask.mockResolvedValue({
    id: TASK, boardId: BOARD, pipelineId: PIPELINE, stageId: "s1", title: "Ship the release", description: "Cut the tag", priority: "high", status: "active",
    dueDate: null, assigneeId: "u1", completedAt: null, position: "a0", createdAt: new Date("2026-09-20T00:00:00Z"), overdue: false,
  });
  useCases.getPipeline.mockResolvedValue(pipeline("owner"));
  useCases.listStages.mockResolvedValue([{ id: "s1", name: "To do", isDone: false }, { id: "s2", name: "Done", isDone: true }]);
  useCases.listMemberProfiles.mockResolvedValue([{ userId: "u1", role: "owner", name: "Olivia", email: null }]);
  useCases.listComments.mockResolvedValue([]);
  useCases.getBoardDashboard.mockResolvedValue({ members: 1, pipelines: [{ id: PIPELINE, name: "Sprint", tasks: { total: 1 }, stages: [{ id: "s1", name: "To do" }, { id: "s2", name: "Done" }] }] });
});

describe("task modal (intercepted route)", () => {
  it("shows the task in a dialog titled after it, with 'Pipeline → Stage' as subtitle, and no page chrome", async () => {
    const html = renderToStaticMarkup(await TaskModalPage({ params: params() }));
    expect(html).toContain("<dialog");
    expect(html).toMatch(/<h2[^>]*>Ship the release<\/h2>/);
    expect(html).toContain("Sprint → To do");
    expect(html).toContain("Cut the tag");
    expect(html).toContain("Comments (0)");
    expect(html).toContain("Move to stage");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<h1");
  });

  it("offers Edit and Delete to writers and neither to viewers, who still read the details and comments", async () => {
    expect(renderToStaticMarkup(await TaskModalPage({ params: params() }))).toMatch(/>Edit<\/button>.*>Delete<\/button>/s);
    useCases.getPipeline.mockResolvedValue(pipeline("guest"));
    const viewer = renderToStaticMarkup(await TaskModalPage({ params: params() }));
    expect(viewer).not.toContain(">Edit</button>");
    expect(viewer).not.toContain(">Delete</button>");
    expect(viewer).not.toContain("Move to stage");
    expect(viewer).toContain("Details");
    expect(viewer).toContain("Comments (0)");
  });

  it("checks the session first and renders 404 for a task of another board, like the page does", async () => {
    await expect(TaskModalPage({ params: params({ boardId: "00000000-0000-4000-8000-0000000000aa" }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    useCases.getTask.mockRejectedValue(new NotFoundError());
    await expect(TaskModalPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    getActor.mockResolvedValue(null);
    await expect(TaskModalPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("renders nothing in the slot when no task is open, whether the page loaded fresh or the visitor navigated away", () => {
    expect(ModalSlotDefault()).toBeNull();
    expect(ModalSlotIdle()).toBeNull();
  });
});
