import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
vi.mock("next/navigation", () => ({ redirect, notFound }));

const getActor = vi.fn();
const useCases = { getBoard: vi.fn(), getBoardDashboard: vi.fn(), getUserDashboard: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { CountsList } = await import("@/components/dashboard/counts-list");
const { PipelineStats } = await import("@/components/dashboard/pipeline-stats");
const { BoardHeader } = await import("@/components/boards/board-header");
const { default: UserDashboardPage } = await import("@/app/(app)/dashboard/page");
const { default: BoardDashboardPage } = await import("@/app/(app)/boards/[boardId]/dashboard/page");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const ZEROS = { total: 0, byPriority: { low: 0, medium: 0, high: 0 }, byStatus: { active: 0, inactive: 0 }, overdue: 0 };
const counts = (extra: Partial<typeof ZEROS> = {}) => ({ ...ZEROS, ...extra });
const board = { id: BOARD_ID, name: "Roadmap", description: "", status: "active", createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getBoard.mockResolvedValue({ board, role: "member" });
});

describe("CountsList", () => {
  it("shows every figure, zeros included, as a labelled list", () => {
    const html = renderToStaticMarkup(<CountsList label="Assigned to you" counts={counts()} />);
    expect(html).toContain('aria-label="Assigned to you"');
    for (const label of ["Total", "High", "Medium", "Low", "Active", "Inactive", "Overdue"]) expect(html).toContain(`>${label}<`);
    expect((html.match(/<dd[^>]*>0</g) ?? []).length).toBe(7);
  });

  it("flags overdue work only when there is some", () => {
    expect(renderToStaticMarkup(<CountsList label="x" counts={counts({ total: 2, overdue: 2 })} />)).toContain("text-red-700");
    expect(renderToStaticMarkup(<CountsList label="x" counts={counts({ total: 2 })} />)).not.toContain("text-red-700");
  });
});

describe("PipelineStats", () => {
  const pipeline = {
    id: "p1",
    name: "Sprint",
    tasks: counts({ total: 2, byPriority: { low: 0, medium: 0, high: 2 } }),
    stages: [
      { id: "s1", name: "To do", isDone: false, tasks: counts({ total: 2, byPriority: { low: 0, medium: 0, high: 2 }, overdue: 1 }) },
      { id: "s2", name: "Done", isDone: true, tasks: counts() },
    ],
  };

  it("is a table with one row per stage, the empty ones showing zeros", () => {
    const html = renderToStaticMarkup(<PipelineStats pipeline={pipeline} boardId={BOARD_ID} />);
    expect(html).toContain("<caption");
    expect(html).toContain("Sprint");
    expect(html).toContain(`href="/boards/${BOARD_ID}/pipelines/p1"`);
    expect(html).toContain("To do");
    expect(html).toContain("Done");
    expect(html).toContain("(done stage)");
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>Done/);
  });

  it("says so when a pipeline has no stages yet", () => {
    expect(renderToStaticMarkup(<PipelineStats pipeline={{ ...pipeline, stages: [], tasks: counts() }} boardId={BOARD_ID} />)).toContain("No stages yet");
  });
});

describe("navigation", () => {
  it("the board header links to the dashboard for every role", () => {
    for (const role of ["owner", "member", "guest"] as const) {
      expect(renderToStaticMarkup(<BoardHeader board={board as never} role={role} />)).toContain(`href="/boards/${BOARD_ID}/dashboard"`);
    }
  });
});

describe("user dashboard page", () => {
  it("renders the figures with zeros for a user with nothing", async () => {
    useCases.getUserDashboard.mockResolvedValue({ boards: 0, assigned: counts() });
    const html = renderToStaticMarkup(await UserDashboardPage());
    expect(html).toContain("Your dashboard");
    expect(html).toContain("Boards you are on");
    expect(html).toContain("Nothing is assigned to you yet");
    expect(useCases.getUserDashboard).toHaveBeenCalledTimes(1);
  });

  it("shows what is assigned to the caller", async () => {
    useCases.getUserDashboard.mockResolvedValue({ boards: 3, assigned: counts({ total: 5, overdue: 2, byPriority: { low: 1, medium: 1, high: 3 }, byStatus: { active: 4, inactive: 1 } }) });
    const html = renderToStaticMarkup(await UserDashboardPage());
    expect(html).toContain('aria-label="Assigned to you"');
    expect(html).not.toContain("Nothing is assigned");
  });

  it("sends a lost session to login", async () => {
    getActor.mockResolvedValue(null);
    await expect(UserDashboardPage()).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.getUserDashboard).not.toHaveBeenCalled();
  });
});

describe("board dashboard page", () => {
  const params = (boardId = BOARD_ID) => Promise.resolve({ boardId });
  const dashboard = {
    boardId: BOARD_ID,
    members: 2,
    tasks: counts({ total: 1 }),
    pipelines: [{ id: "p1", name: "Sprint", tasks: counts({ total: 1 }), stages: [{ id: "s1", name: "To do", isDone: false, tasks: counts({ total: 1 }) }] }],
  };

  it("shows the board, its members and a table per pipeline", async () => {
    useCases.getBoardDashboard.mockResolvedValue(dashboard);
    const html = renderToStaticMarkup(await BoardDashboardPage({ params: params() }));
    expect(html).toContain("Roadmap");
    expect(html).toContain("2 members");
    expect(html).toContain("Sprint");
    expect(useCases.getBoardDashboard).toHaveBeenCalledWith({ boardId: BOARD_ID });
  });

  it("says a board with no pipelines has nothing to count yet", async () => {
    useCases.getBoardDashboard.mockResolvedValue({ ...dashboard, members: 1, pipelines: [], tasks: counts() });
    const html = renderToStaticMarkup(await BoardDashboardPage({ params: params() }));
    expect(html).toContain("1 member");
    expect(html).toContain("No pipelines yet");
  });

  it("is a 404 for a board that is not yours, without reading its numbers", async () => {
    useCases.getBoard.mockRejectedValue(new NotFoundError());
    await expect(BoardDashboardPage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(useCases.getBoardDashboard).not.toHaveBeenCalled();
  });
});
