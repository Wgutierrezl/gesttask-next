import { renderToStaticMarkupWithIntl as renderToStaticMarkup } from "@tests/support/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServer);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction: async () => undefined }));

const getActor = vi.fn();
const useCases = { getBoard: vi.fn(), listMemberProfiles: vi.fn(), listPipelines: vi.fn(), listStages: vi.fn(), createPipeline: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { BoardHeader } = await import("@/components/boards/board-header");
const { PipelineList } = await import("@/components/boards/pipeline-list");
const { CreatePipelineForm } = await import("@/components/boards/create-pipeline-form");
const { default: BoardPage } = await import("@/app/(app)/boards/[boardId]/page");
const { loadPage } = await import("@/app/_shared/load-page");
const { createPipelineAction } = await vi.importActual<typeof import("@/app/_actions/pipelines")>("@/app/_actions/pipelines");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const board = { id: BOARD_ID, name: "Roadmap", description: "Q4 plans", status: "active", createdAt: new Date() };
const params = (boardId = BOARD_ID) => Promise.resolve({ boardId });
const search = (query: { pipelinesPage?: string } = {}) => Promise.resolve(query);
const member = (userId: string, role: string, name: string, email: string | null = null) => ({ userId, role, name, email });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getBoard.mockResolvedValue({ board, role: "owner" });
  useCases.listMemberProfiles.mockResolvedValue([member("u", "owner", "Olivia", "olivia@example.com"), member("v", "guest", "Demo Viewer")]);
  useCases.listPipelines.mockResolvedValue([{ id: "p1", boardId: BOARD_ID, name: "Sprint", description: "Two weeks" }]);
  useCases.listStages.mockResolvedValue([{ name: "To do" }]);
});

describe("components", () => {
  it("BoardHeader shows the title, role and archived state, and the settings link only to owners", () => {
    const owner = renderToStaticMarkup(<BoardHeader board={{ ...board, status: "inactive" } as never} role="owner" />);
    expect(owner).toContain("<h1");
    expect(owner).toContain("Roadmap");
    expect(owner).toContain("Archived");
    expect(owner).toContain(`href="/boards/${BOARD_ID}/settings"`);
    expect(renderToStaticMarkup(<BoardHeader board={board as never} role="member" />)).not.toContain("/settings");
  });

  it("PipelineList shows pipelines or an empty message", () => {
    expect(renderToStaticMarkup(<PipelineList boardId={BOARD_ID} pipelines={[{ id: "p1", name: "Sprint", description: "Two weeks", stages: [] }]} role="owner" />)).toContain("Two weeks");
    expect(renderToStaticMarkup(<PipelineList boardId={BOARD_ID} pipelines={[]} role="owner" />)).toContain("No pipelines on this board");
  });

  it("CreatePipelineForm sends the board id and submits", () => {
    const html = renderToStaticMarkup(<CreatePipelineForm boardId={BOARD_ID} />);
    expect(html).toContain(">Create pipeline</button>");
    expect(html).toContain(`name="boardId" value="${BOARD_ID}"`);
    expect(html.match(/name="stages"/g)).toHaveLength(3);
  });
});

describe("BoardPage", () => {
  it("renders the board, its members and pipelines, with the create form for owners", async () => {
    const html = renderToStaticMarkup(await BoardPage({ params: params(), searchParams: search() }));
    expect(html).toContain("Roadmap");
    expect(html).toContain("Sprint");
    expect(html).toContain("To do"); // the stage chips come from the pipeline stages
    expect(html).toContain("Manage members"); // the member list itself only renders once the dialog is open
    expect(useCases.listMemberProfiles).toHaveBeenCalled();
    expect(html).toContain("Create pipeline");
    expect(useCases.getBoard).toHaveBeenCalledWith({ boardId: BOARD_ID });
  });

  it("hides the create form from members and viewers", async () => {
    useCases.getBoard.mockResolvedValue({ board, role: "member" });
    const html = renderToStaticMarkup(await BoardPage({ params: params(), searchParams: search() }));
    expect(html).not.toContain("Create pipeline");
    expect(html).toContain("Sprint");
  });

  it.each([["a foreign or missing board", new NotFoundError()], ["a malformed id", new ValidationError("Invalid input", { boardId: ["bad"] })]])("renders the 404 page for %s", async (_name, error) => {
    useCases.getBoard.mockRejectedValue(error);
    await expect(BoardPage({ params: params(), searchParams: search() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("checks the session before loading anything", async () => {
    getActor.mockResolvedValue(null);
    await expect(BoardPage({ params: params(), searchParams: search() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.getBoard).not.toHaveBeenCalled();
  });
});

describe("BoardPage paging", () => {
  const many = (n: number, make: (i: number) => object) => Array.from({ length: n }, (_v, i) => make(i));

  it("asks for one page of pipelines with a lookahead row, and for the members once, up to the load cap", async () => {
    await BoardPage({ params: params(), searchParams: search({ pipelinesPage: "3" }) });
    expect(useCases.listPipelines).toHaveBeenCalledWith({ boardId: BOARD_ID, limit: 13, offset: 24 });
    expect(useCases.listMemberProfiles).toHaveBeenCalledTimes(1);
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: BOARD_ID, limit: 200, offset: 0 });
  });

  it("links to the next page of pipelines and hides the lookahead row", async () => {
    useCases.listPipelines.mockResolvedValue(many(13, (i) => ({ id: `p${i}`, name: `Flow ${i}`, description: "" })));
    const html = renderToStaticMarkup(await BoardPage({ params: params(), searchParams: search({ pipelinesPage: "1" }) }));
    expect(html).toContain(`href="/boards/${BOARD_ID}?pipelinesPage=2"`);
    expect(html).not.toContain("Flow 12<");
  });

  it("says so when a page is past the end of the pipelines", async () => {
    useCases.listPipelines.mockResolvedValue([]);
    const html = renderToStaticMarkup(await BoardPage({ params: params(), searchParams: search({ pipelinesPage: "5" }) }));
    expect(html).toContain("No pipelines on this page");
    expect(html).not.toContain("No pipelines on this board");
  });
});

describe("loadPage and validation errors", () => {
  it("treats malformed ids from the URL as missing resources", async () => {
    await expect(loadPage(async () => Promise.reject(new ValidationError()))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("createPipelineAction", () => {
  const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

  it("creates the pipeline on the bound board and refreshes the board page", async () => {
    useCases.createPipeline.mockResolvedValue({ id: "p2" });
    expect(await createPipelineAction(undefined, form({ boardId: BOARD_ID, name: "Bugs", description: "Triage" }))).toEqual({ ok: true, data: null });
    expect(useCases.createPipeline).toHaveBeenCalledWith({ boardId: BOARD_ID, name: "Bugs", description: "Triage" });
    expect(revalidatePath).toHaveBeenCalledWith(`/boards/${BOARD_ID}`);
  });

  it("returns conflicts and field errors as state", async () => {
    useCases.createPipeline.mockRejectedValueOnce(new ValidationError("Invalid input", { name: ["Name is required"] }));
    expect(await createPipelineAction(undefined, form({ boardId: BOARD_ID, name: "" }))).toMatchObject({ ok: false, fieldErrors: { name: ["Name is required"] } });
    useCases.createPipeline.mockRejectedValueOnce(new ConflictError("Nope"));
    expect(await createPipelineAction(undefined, form({ boardId: BOARD_ID, name: "x" }))).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});
