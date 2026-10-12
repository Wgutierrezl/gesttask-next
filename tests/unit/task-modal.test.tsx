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
const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
const getActor = vi.fn();
const useCases = { getTask: vi.fn(), getPipeline: vi.fn(), listStages: vi.fn(), listMemberProfiles: vi.fn(), listComments: vi.fn(), getBoardDashboard: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger: { error: vi.fn() } }) }));

const { default: TaskModalPage, generateMetadata } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/(.)tasks/[taskId]/page");
const { default: ModalSlotDefault } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/default");
const { default: ModalSlotIdle } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/page");

const BOARD = "00000000-0000-4000-8000-000000000001";
const PIPELINE = "00000000-0000-4000-8000-000000000002";
const TASK = "00000000-0000-4000-8000-000000000003";
const params = (over: Partial<Record<"boardId" | "pipelineId" | "taskId", string>> = {}) => Promise.resolve({ boardId: BOARD, pipelineId: PIPELINE, taskId: TASK, ...over });
const pipeline = (role: string) => ({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role });

beforeEach(() => {
  vi.clearAllMocks();
  active.locale = "en";
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
    expect(renderToStaticMarkup(await TaskModalPage({ params: params() }))).toMatch(/<button[^>]*aria-label="Edit"[^>]*>.*<button[^>]*aria-label="Delete"/s);
    useCases.getPipeline.mockResolvedValue(pipeline("guest"));
    const viewer = renderToStaticMarkup(await TaskModalPage({ params: params() }));
    expect(viewer).not.toContain('aria-label="Edit"');
    expect(viewer).not.toContain('aria-label="Delete"');
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

describe("task modal in Spanish", () => {
  it("titles the route from the catalog and translates the subtitle, details, move form and comment section", async () => {
    active.locale = "es";
    expect(await generateMetadata()).toEqual({ title: "Tarea" });
    useCases.getTask.mockResolvedValue({ ...(await useCases.getTask()), stageId: "missing" });
    const html = renderToStaticMarkup(await TaskModalPage({ params: params() }), { locale: "es" });
    for (const text of ["Sprint → Etapa desconocida", "Detalles", "Sin fecha de vencimiento", "Mover tarea", "Mover a la etapa", "Comentarios (0)", "Aún no hay comentarios.", 'aria-label="Editar"', 'aria-label="Eliminar"']) expect(html, text).toContain(text);
    for (const text of ["Unknown stage", "No due date", "No comments yet."]) expect(html, text).not.toContain(text);
  });
});
