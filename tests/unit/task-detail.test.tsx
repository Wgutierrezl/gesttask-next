import { renderToStaticMarkupWithIntl as renderToStaticMarkup } from "@tests/support/render";
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
const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
const getActor = vi.fn();
const useCases = { getTask: vi.fn(), getPipeline: vi.fn(), listStages: vi.fn(), listMemberProfiles: vi.fn(), listComments: vi.fn(), getBoardDashboard: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger: { error: vi.fn() } }) }));

const { default: TaskPage, generateMetadata } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]/page");
const { loadTaskDetail } = await import("@/app/_shared/task-detail");

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
  active.locale = "en";
  getActor.mockResolvedValue({ userId: "u1", isGuest: false });
  useCases.getTask.mockResolvedValue(task());
  useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "owner" });
  useCases.listStages.mockResolvedValue([{ id: "s1", name: "To do", isDone: false }, { id: "s2", name: "Done", isDone: true }]);
  useCases.listMemberProfiles.mockResolvedValue([{ userId: "u1", role: "owner", name: "Olivia", email: null }]);
  useCases.listComments.mockResolvedValue([]);
  useCases.getBoardDashboard.mockResolvedValue({ members: 1, pipelines: [{ id: PIPELINE, name: "Sprint", tasks: { total: 1 }, stages: [{ id: "s1", name: "To do" }, { id: "s2", name: "Done" }] }] });
});

describe("TaskPage across pipelines", () => {
  it("offers the stages of the board's other pipelines in the Move form, grouped by pipeline", async () => {
    useCases.getBoardDashboard.mockResolvedValue({
      members: 1,
      pipelines: [
        { id: "p-other", name: "Backlog", tasks: { total: 0 }, stages: [{ id: "i1", name: "Ideas" }] },
        { id: PIPELINE, name: "Sprint", tasks: { total: 1 }, stages: [{ id: "s1", name: "To do" }, { id: "s2", name: "Done" }] },
      ],
    });
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain('<optgroup label="Sprint">');
    expect(html).toContain('<optgroup label="Backlog">');
    expect(html).toContain("Ideas");
  });

  it("does not read the board's pipelines for a viewer, who gets no Move form", async () => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(useCases.getBoardDashboard).not.toHaveBeenCalled();
  });

  it("keeps a flat stage list when the board has one pipeline", async () => {
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).not.toContain("<optgroup");
  });
});

const asideOf = (html: string) => /<aside[^>]*aria-label="Task details"[^>]*>(.*?)<\/aside>/s.exec(html)?.[1] ?? "";
const headingLevels = (html: string) => [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));

describe("TaskPage layout", () => {
  it("keeps the task's content apart from a sidebar with its details and, for writers, the move control", async () => {
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    const aside = asideOf(html);
    for (const text of ["Stage", "To do", "Priority", "High", "Assignee", "Olivia", "Due date", "Overdue", "Move to stage"]) expect(aside).toContain(text);
    for (const text of ["Cut the tag", "Comments (0)", "Add a comment"]) {
      expect(html).toContain(text);
      expect(aside).not.toContain(text);
    }
  });

  it("puts Edit and Delete in the page header for writers, as buttons that open modals rather than inline forms", async () => {
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    const header = /<header[^>]*>(.*?)<\/header>/s.exec(html)?.[1] ?? "";
    expect(header).toContain("Ship the release");
    expect(header).toMatch(/<button[^>]*>.*?Edit<\/button>/s);
    expect(header).toMatch(/<button[^>]*>.*?Delete<\/button>/s);
    expect(asideOf(html)).not.toContain("Delete");
    expect(html).not.toContain('name="confirm"');
    expect(html).not.toContain('name="title"');
  });

  it("adds no landmark regions beside the aside itself, and sizes its headings alike", async () => {
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    const aside = asideOf(html);
    expect(aside).not.toContain("<section");
    expect(aside).not.toContain("aria-labelledby");
    expect(html).not.toMatch(/<section[^>]*aria-labelledby="edit-heading"/);
    const sizes = [...aside.matchAll(/<h2[^>]*class="([^"]*)"/g)].map((m) => /text-(?:base|lg|xl)/.exec(m[1]!)?.[0]);
    expect(sizes).toHaveLength(2);
    expect(new Set(sizes).size).toBe(1);
  });

  it("gives a viewer the details but no controls in the sidebar", async () => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    const aside = asideOf(renderToStaticMarkup(await TaskPage({ params: params() })));
    expect(aside).toMatch(/<dt[^>]*>Stage<\/dt><dd[^>]*>.*To do/s);
    expect(aside).toContain("Priority");
    expect(aside).not.toContain("Move to stage");
    expect(aside).not.toContain("Delete");
  });

  it.each(["owner", "guest"])("is one landmark with one h1 and no skipped heading level for a %s", async (role) => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role });
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html.match(/<main[ >]/g)).toHaveLength(1);
    const levels = headingLevels(html);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    expect(levels.length).toBeGreaterThanOrEqual(3);
    levels.forEach((level, i) => i > 0 && expect(level).toBeLessThanOrEqual(levels[i - 1]! + 1));
  });
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
    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Delete</button>");
    expect(html).toContain("Move to stage");
    expect(html).toContain(`href="/boards/${BOARD}/pipelines/${PIPELINE}"`);
  });

  it("lists the task's comments with author, attachments and the form to add one", async () => {
    useCases.listComments.mockResolvedValue([
      { id: "c1", taskId: TASK, authorId: "u1", authorName: "Olivia", body: "Needs a changelog", createdAt: new Date("2026-10-09T10:00:00Z"), canManage: true, attachments: [{ id: "a1", fileName: "plan.pdf", contentType: "application/pdf", size: 2048 }] },
      { id: "c2", taskId: TASK, authorId: null, authorName: "Deleted user", body: "Left a note", createdAt: new Date("2026-10-09T11:00:00Z"), canManage: false, attachments: [] },
    ]);
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(useCases.listComments).toHaveBeenCalledWith({ taskId: TASK, limit: 200, offset: 0 });
    expect(html).toContain("Comments (2)");
    expect(html).toContain("Needs a changelog");
    expect(html).toContain("Deleted user");
    expect(html).toContain('href="/api/attachments/a1/download"');
    expect(html).toContain("Add a comment");
  });

  it("lets a read-only viewer read and write comments, since guests may comment", async () => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    useCases.listComments.mockResolvedValue([{ id: "c1", taskId: TASK, authorId: "u9", authorName: "Marco", body: "Hello", createdAt: new Date("2026-10-09T10:00:00Z"), canManage: false, attachments: [] }]);
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Hello");
    expect(html).toContain("Add a comment");
    expect(html).not.toContain("Edit task");
    expect(html).not.toContain("Attach files");
    expect(html).toContain("only members can attach files");
  });

  it("offers the file picker to writers, with the demo limits spelled out for demo sessions", async () => {
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).toContain("Attach files");
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).not.toContain("Demo sessions can attach");
    getActor.mockResolvedValue({ userId: "g1", isGuest: true });
    expect(renderToStaticMarkup(await TaskPage({ params: params() }))).toContain("Demo sessions can attach up to 5 files in total");
  });

  it("does not load comments for a task the viewer may not see", async () => {
    useCases.getTask.mockRejectedValue(new NotFoundError());
    await expect(TaskPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.listComments).not.toHaveBeenCalled();
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

  it("looks the assignee up by id, so a member beyond the first 200 is still named and offered when editing", async () => {
    useCases.getTask.mockResolvedValue(task({ assigneeId: "far" }));
    useCases.listMemberProfiles.mockImplementation(async (input: { userIds?: string[] }) =>
      input.userIds ? [{ userId: "far", role: "member", name: "Far Away", email: null }] : [{ userId: "u1", role: "owner", name: "Olivia", email: null }],
    );
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Far Away");
    expect(html).not.toContain("Former member");
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: BOARD, userIds: ["far"] });
    // The edit form lives in a modal that is not rendered until opened: what it gets is the member list, with the assignee in it.
    expect((await loadTaskDetail(await params(), { isGuest: false })).members).toContainEqual({ userId: "far", name: "Far Away" });
  });

  it("is read-only for viewers", async () => {
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    const html = renderToStaticMarkup(await TaskPage({ params: params() }));
    expect(html).toContain("Ship the release");
    expect(html).not.toContain(">Edit</button>");
    expect(html).not.toContain(">Delete</button>");
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

describe("TaskPage in Spanish", () => {
  const comment = { id: "c1", taskId: TASK, authorId: "u1", authorName: "Olivia", body: "Needs a changelog", createdAt: new Date("2026-10-09T10:00:00Z"), canManage: true, attachments: [{ id: "a1", fileName: "plan.pdf", contentType: "application/pdf", size: 1536 }] };

  it("titles the page from the catalog in both languages", async () => {
    expect(await generateMetadata()).toEqual({ title: "Task" });
    active.locale = "es";
    expect(await generateMetadata()).toEqual({ title: "Tarea" });
  });

  it("translates the chrome, details, move form and comments while task and user data stay as written", async () => {
    active.locale = "es";
    useCases.getTask.mockResolvedValue(task({ stageId: "s2", completedAt: new Date("2026-10-09T10:00:00Z"), overdue: true }));
    useCases.listComments.mockResolvedValue([comment]);
    const html = renderToStaticMarkup(await TaskPage({ params: params() }), { locale: "es" });
    for (const text of [
      "Volver al pipeline", 'aria-label="Ruta de navegación"', 'aria-label="Detalles de la tarea"', ">Detalles<", "Etapa final", "Prioridad", ">Alta<", "Responsable", "Olivia",
      "Fecha de vencimiento", "Vence 1 oct 2026", "Vencida", "Completada 9 oct 2026", "Creada", "20 sept 2026", "Mover a la etapa", "Mover tarea",
      "Comentarios (1)", 'aria-label="Comentario de Olivia"', "Publicado 9 oct 2026", "(1,5 KB)", ">Editar<", ">Eliminar<", "Añadir un comentario", "Adjuntar archivos",
      "hasta 5,0 MB cada uno y 5 por comentario",
    ]) expect(html, text).toContain(text);
    for (const text of ["Ship the release", "Cut the tag", "To do", "plan.pdf", "Needs a changelog"]) expect(html, text).toContain(text);
    for (const text of ["Back to pipeline", "Details", "Comments (", "Overdue", "Add a comment"]) expect(html, text).not.toContain(text);
  });

  it("names an unassigned task and a former member in Spanish, and a viewer reads the guest note", async () => {
    active.locale = "es";
    useCases.getTask.mockResolvedValue(task({ assigneeId: null }));
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE, boardId: BOARD, name: "Sprint", description: "" }, role: "guest" });
    const unassigned = renderToStaticMarkup(await TaskPage({ params: params() }), { locale: "es" });
    expect(unassigned).toContain("Sin asignar");
    expect(unassigned).toContain("Los invitados pueden comentar, pero solo los miembros pueden adjuntar archivos.");
    useCases.getTask.mockResolvedValue(task({ assigneeId: "gone" }));
    expect(renderToStaticMarkup(await TaskPage({ params: params() }), { locale: "es" })).toContain("Ex miembro");
  });
});
