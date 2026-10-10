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

const getActor = vi.fn();
const useCases = { getPipeline: vi.fn(), listStages: vi.fn(), listTasksByPipeline: vi.fn(), listMemberProfiles: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { buildColumns } = await import("@/components/kanban/columns");
const { TaskCard } = await import("@/components/kanban/task-card");
const { KanbanColumn } = await import("@/components/kanban/kanban-column");
const { loadTasks, toStageView, toTaskCardView } = await import("@/app/_shared/kanban-data");
const { default: PipelinePage } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/page");
const { PipelineList } = await import("@/components/boards/pipeline-list");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const PIPELINE_ID = "00000000-0000-4000-8000-000000000002";
const stage = (id: string, name: string, isDone = false) => ({ id, pipelineId: PIPELINE_ID, boardId: BOARD_ID, name, isDone, position: id });
const task = (id: string, stageId: string, overrides: Record<string, unknown> = {}) => ({
  id, boardId: BOARD_ID, pipelineId: PIPELINE_ID, stageId, title: `Task ${id}`, description: "", priority: "medium", status: "active",
  dueDate: null, assigneeId: null, completedAt: null, position: id, createdAt: new Date("2026-10-01T00:00:00Z"), overdue: false, ...overrides,
});
const params = (boardId = BOARD_ID, pipelineId = PIPELINE_ID) => Promise.resolve({ boardId, pipelineId });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE_ID, boardId: BOARD_ID, name: "Sprint", description: "Two weeks" }, role: "owner" });
  useCases.listStages.mockResolvedValue([stage("s1", "To do"), stage("s2", "Done", true)]);
  useCases.listTasksByPipeline.mockResolvedValue([task("t1", "s1"), task("t2", "s2", { completedAt: new Date("2026-10-09T10:00:00Z") })]);
  useCases.listMemberProfiles.mockResolvedValue([{ userId: "u", role: "owner", name: "Olivia", email: null }]);
});

describe("buildColumns", () => {
  it("keeps the stage order and each stage's task order, with empty stages as empty columns", () => {
    const columns = buildColumns(
      [toStageView(stage("s1", "To do")), toStageView(stage("s2", "Doing")), toStageView(stage("s3", "Done", true))],
      ["b", "a", "c"].map((id, i) => toTaskCardView(task(id, i === 2 ? "s3" : "s1") as never)),
    );
    expect(columns.map((c) => [c.stage.name, c.tasks.map((t) => t.id)])).toEqual([["To do", ["b", "a"]], ["Doing", []], ["Done", ["c"]]]);
  });

  it("drops tasks whose stage is not in the list instead of inventing a column", () => {
    expect(buildColumns([toStageView(stage("s1", "To do"))], [toTaskCardView(task("x", "gone") as never)])[0]!.tasks).toEqual([]);
  });
});

describe("toTaskCardView", () => {
  it("serializes dates so the card can cross to client components", () => {
    const view = toTaskCardView(task("t", "s", { completedAt: new Date("2026-10-09T10:00:00Z"), dueDate: "2026-10-12" }) as never);
    expect(view).toMatchObject({ completedAt: "2026-10-09T10:00:00.000Z", dueDate: "2026-10-12" });
    expect(Object.keys(view)).not.toContain("createdAt");
  });
});

describe("loadTasks", () => {
  const rows = (n: number, from = 0) => Array.from({ length: n }, (_v, i) => from + i);

  it("reads pages of 200 until one comes back short", async () => {
    const list = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => rows(Math.min(limit, 450 - offset), offset));
    const { tasks, truncated } = await loadTasks(list);
    expect(tasks).toHaveLength(450);
    expect(truncated).toBe(false);
    expect(list.mock.calls.map(([page]) => page)).toEqual([{ limit: 200, offset: 0 }, { limit: 200, offset: 200 }, { limit: 200, offset: 400 }]);
  });

  it("stops at the cap and says so only when more tasks exist", async () => {
    const endless = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => rows(limit, offset));
    const capped = await loadTasks(endless, 400);
    expect(capped.tasks).toHaveLength(400);
    expect(capped.truncated).toBe(true);
    const exact = await loadTasks(async ({ limit, offset }) => rows(Math.max(0, Math.min(limit, 400 - offset)), offset), 400);
    expect(exact).toMatchObject({ truncated: false });
    expect(exact.tasks).toHaveLength(400);
  });
});

describe("TaskCard and KanbanColumn", () => {
  const card = (overrides: Record<string, unknown> = {}) => toTaskCardView(task("t1", "s1", overrides) as never);

  it("shows priority, due date, assignee and flags overdue in text, not just colour", () => {
    const html = renderToStaticMarkup(<TaskCard task={card({ priority: "high", dueDate: "2026-10-01", overdue: true, assigneeId: "u" })} assigneeName="Olivia" />);
    expect(html).toContain("Task t1");
    expect(html).toContain("High");
    expect(html).toContain("Due Oct 1, 2026");
    expect(html).toContain("Overdue");
    expect(html).toContain("Olivia");
  });

  it("shows when a task was completed and says Unassigned without an assignee", () => {
    const html = renderToStaticMarkup(<TaskCard task={card({ completedAt: new Date("2026-10-09T10:00:00Z") })} assigneeName={null} />);
    expect(html).toContain("Completed Oct 9, 2026");
    expect(html).toContain("Unassigned");
    expect(html).not.toContain("Overdue");
  });

  it("marks the done stage and counts its tasks", () => {
    const html = renderToStaticMarkup(<KanbanColumn column={{ stage: toStageView(stage("s2", "Done", true)), tasks: [card()] }} nameOf={() => null} />);
    expect(html).toContain("Done stage");
    expect(html).toContain('aria-label="Done, 1 task"');
  });

  it("says an empty column is empty", () => {
    expect(renderToStaticMarkup(<KanbanColumn column={{ stage: toStageView(stage("s1", "To do")), tasks: [] }} nameOf={() => null} />)).toContain("No tasks");
  });
});

describe("PipelinePage", () => {
  it("renders the pipeline as columns, with names resolved for assignees", async () => {
    useCases.listTasksByPipeline.mockResolvedValue([task("t1", "s1", { assigneeId: "u" }), task("t2", "s2", { completedAt: new Date("2026-10-09T10:00:00Z") })]);
    const html = renderToStaticMarkup(await PipelinePage({ params: params() }));
    expect(html).toContain("Sprint");
    expect(html).toContain("To do");
    expect(html).toContain("Done stage");
    expect(html).toContain("Olivia");
    expect(html).toContain("Completed Oct 9, 2026");
    expect(html).toContain(`href="/boards/${BOARD_ID}"`);
    expect(useCases.listStages).toHaveBeenCalledWith({ pipelineId: PIPELINE_ID, limit: 200 });
  });

  it("offers stage management to owners only, with each stage's task count", async () => {
    const owner = renderToStaticMarkup(await PipelinePage({ params: params() }));
    expect(owner).toContain("Manage stages");
    expect(owner).toContain('aria-label="Move To do right"');
    for (const role of ["member", "guest"]) {
      useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE_ID, boardId: BOARD_ID, name: "Sprint", description: "" }, role });
      expect(renderToStaticMarkup(await PipelinePage({ params: params() }))).not.toContain("Manage stages");
    }
  });

  it("offers task creation to owners and members, not to viewers", async () => {
    expect(renderToStaticMarkup(await PipelinePage({ params: params() }))).toContain("Add a task");
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE_ID, boardId: BOARD_ID, name: "Sprint", description: "" }, role: "member" });
    expect(renderToStaticMarkup(await PipelinePage({ params: params() }))).toContain("Add a task");
    useCases.getPipeline.mockResolvedValue({ pipeline: { id: PIPELINE_ID, boardId: BOARD_ID, name: "Sprint", description: "" }, role: "guest" });
    expect(renderToStaticMarkup(await PipelinePage({ params: params() }))).not.toContain("Add a task");
  });

  it("authorizes through getPipeline first and never reads the rest for a foreign pipeline", async () => {
    useCases.getPipeline.mockRejectedValue(new NotFoundError());
    await expect(PipelinePage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.listStages).not.toHaveBeenCalled();
    expect(useCases.listTasksByPipeline).not.toHaveBeenCalled();
    expect(useCases.listMemberProfiles).not.toHaveBeenCalled();
  });

  it("renders 404 for a malformed id and for a pipeline that belongs to another board than the URL says", async () => {
    useCases.getPipeline.mockRejectedValueOnce(new ValidationError());
    await expect(PipelinePage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(PipelinePage({ params: params("00000000-0000-4000-8000-0000000000aa") })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.listStages).not.toHaveBeenCalled();
  });

  it("checks the session before anything else", async () => {
    getActor.mockResolvedValue(null);
    await expect(PipelinePage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.getPipeline).not.toHaveBeenCalled();
  });

  it("warns when only part of a very large pipeline is shown", async () => {
    useCases.listTasksByPipeline.mockImplementation(async ({ limit, offset }: { limit: number; offset: number }) =>
      Array.from({ length: limit }, (_v, i) => task(`t${offset + i}`, "s1")),
    );
    const html = renderToStaticMarkup(await PipelinePage({ params: params() }));
    expect(html).toContain("Showing the first 1000 tasks");
  });
});

describe("PipelineList links", () => {
  it("links each pipeline to its Kanban page when given the board", () => {
    const html = renderToStaticMarkup(<PipelineList boardId={BOARD_ID} pipelines={[{ id: PIPELINE_ID, name: "Sprint", description: "" }]} />);
    expect(html).toContain(`href="/boards/${BOARD_ID}/pipelines/${PIPELINE_ID}"`);
  });
});
