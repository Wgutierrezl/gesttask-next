import { renderToStaticMarkup } from "react-dom/server";
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
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction: async () => undefined }));

const getActor = vi.fn();
const useCases = { getBoard: vi.fn(), listMemberProfiles: vi.fn(), listPipelines: vi.fn(), createPipeline: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { BoardHeader } = await import("@/components/boards/board-header");
const { MembersPanel } = await import("@/components/boards/members-panel");
const { PipelineList } = await import("@/components/boards/pipeline-list");
const { CreatePipelineForm } = await import("@/components/boards/create-pipeline-form");
const { default: BoardPage } = await import("@/app/(app)/boards/[boardId]/page");
const { loadPage } = await import("@/app/_shared/load-page");
const { createPipelineAction } = await vi.importActual<typeof import("@/app/_actions/pipelines")>("@/app/_actions/pipelines");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const board = { id: BOARD_ID, name: "Roadmap", description: "Q4 plans", status: "active", createdAt: new Date() };
const params = (boardId = BOARD_ID) => Promise.resolve({ boardId });
const member = (userId: string, role: string, name: string, email: string | null = null) => ({ userId, role, name, email });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getBoard.mockResolvedValue({ board, role: "owner" });
  useCases.listMemberProfiles.mockResolvedValue([member("u", "owner", "Olivia", "olivia@example.com"), member("v", "guest", "Demo Viewer")]);
  useCases.listPipelines.mockResolvedValue([{ id: "p1", boardId: BOARD_ID, name: "Sprint", description: "Two weeks" }]);
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

  it("MembersPanel lists names, emails and role labels, naming the deleted accounts", () => {
    const html = renderToStaticMarkup(<MembersPanel members={[member("u", "owner", "Olivia", "olivia@example.com") as never, member("v", "guest", "Demo Viewer") as never]} />);
    expect(html).toContain("Olivia");
    expect(html).toContain("olivia@example.com");
    expect(html).toContain("Owner");
    expect(html).toContain("Viewer");
    expect(html).toContain('aria-label="Members"');
  });

  it("PipelineList shows pipelines or an empty message", () => {
    expect(renderToStaticMarkup(<PipelineList pipelines={[{ id: "p1", name: "Sprint", description: "Two weeks" }]} />)).toContain("Two weeks");
    expect(renderToStaticMarkup(<PipelineList pipelines={[]} />)).toContain("No pipelines yet");
  });

  it("CreatePipelineForm has labelled fields", () => {
    const html = renderToStaticMarkup(<CreatePipelineForm boardId={BOARD_ID} />);
    expect(html).toContain('for="name"');
    expect(html).toContain("Create pipeline");
    expect(html).toContain(`name="boardId" value="${BOARD_ID}"`);
  });
});

describe("BoardPage", () => {
  it("renders the board, its members and pipelines, with the create form for owners", async () => {
    const html = renderToStaticMarkup(await BoardPage({ params: params() }));
    expect(html).toContain("Roadmap");
    expect(html).toContain("Olivia");
    expect(html).toContain("Sprint");
    expect(html).toContain("Create pipeline");
    expect(useCases.getBoard).toHaveBeenCalledWith({ boardId: BOARD_ID });
  });

  it("hides the create form from members and viewers", async () => {
    useCases.getBoard.mockResolvedValue({ board, role: "member" });
    const html = renderToStaticMarkup(await BoardPage({ params: params() }));
    expect(html).not.toContain("Create pipeline");
    expect(html).toContain("Sprint");
  });

  it.each([["a foreign or missing board", new NotFoundError()], ["a malformed id", new ValidationError("Invalid input", { boardId: ["bad"] })]])("renders the 404 page for %s", async (_name, error) => {
    useCases.getBoard.mockRejectedValue(error);
    await expect(BoardPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("checks the session before loading anything", async () => {
    getActor.mockResolvedValue(null);
    await expect(BoardPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.getBoard).not.toHaveBeenCalled();
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
