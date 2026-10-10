import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/_actions/members", () => ({ addMemberAction: async () => undefined, changeMemberRoleAction: async () => undefined, removeMemberAction: async () => undefined }));
vi.mock("@/app/_actions/boards", () => ({ createBoardAction: async () => undefined, updateBoardAction: async () => undefined, setBoardStatusAction: async () => undefined, deleteBoardAction: async () => undefined }));

const getActor = vi.fn();
const useCases = { getBoard: vi.fn(), updateBoard: vi.fn(), deleteBoard: vi.fn(), listMemberProfiles: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { EditBoardForm } = await import("@/components/boards/edit-board-form");
const { ArchiveBoardForm } = await import("@/components/boards/archive-board-form");
const { DeleteBoardForm } = await import("@/components/boards/delete-board-form");
const { default: SettingsPage } = await import("@/app/(app)/boards/[boardId]/settings/page");
const actions = await vi.importActual<typeof import("@/app/_actions/boards")>("@/app/_actions/boards");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const board = { id: BOARD_ID, name: "Roadmap", description: "Q4 plans", status: "active" as const, createdAt: new Date() };
const params = () => Promise.resolve({ boardId: BOARD_ID });
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getBoard.mockResolvedValue({ board, role: "owner" });
  useCases.listMemberProfiles.mockResolvedValue([]);
});

describe("components", () => {
  it("EditBoardForm is prefilled and labelled", () => {
    const html = renderToStaticMarkup(<EditBoardForm board={board} />);
    expect(html).toContain('value="Roadmap"');
    expect(html).toContain("Q4 plans");
    expect(html).toContain('for="name"');
    expect(html).toContain("Save changes");
    expect(html).toContain(`name="boardId" value="${BOARD_ID}"`);
  });

  it("ArchiveBoardForm offers the opposite of the current state", () => {
    const active = renderToStaticMarkup(<ArchiveBoardForm board={board} />);
    expect(active).toContain("Archive board");
    expect(active).toContain('name="status" value="inactive"');
    const archived = renderToStaticMarkup(<ArchiveBoardForm board={{ ...board, status: "inactive" }} />);
    expect(archived).toContain("Restore board");
    expect(archived).toContain('name="status" value="active"');
  });

  it("DeleteBoardForm requires an explicit confirmation and warns about the data", () => {
    const html = renderToStaticMarkup(<DeleteBoardForm board={board} />);
    expect(html).toContain('name="confirm"');
    expect(html).toContain("required");
    expect(html).toContain("permanently");
    expect(html).toContain("Delete board");
  });
});

describe("SettingsPage", () => {
  it("renders all three controls for the owner", async () => {
    const html = renderToStaticMarkup(await SettingsPage({ params: params() }));
    expect(html).toContain("Save changes");
    expect(html).toContain("Archive board");
    expect(html).toContain("Delete board");
  });

  it.each(["member", "guest"])("renders the 404 page for a %s, so settings never reveal themselves", async (role) => {
    useCases.getBoard.mockResolvedValue({ board, role });
    await expect(SettingsPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(useCases.listMemberProfiles).not.toHaveBeenCalled();
  });

  it("checks the session first and 404s foreign boards", async () => {
    getActor.mockResolvedValue(null);
    await expect(SettingsPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    getActor.mockResolvedValue({ userId: "x", isGuest: false });
    useCases.getBoard.mockRejectedValue(new NotFoundError());
    await expect(SettingsPage({ params: params() })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("updateBoardAction", () => {
  it("renames the bound board and refreshes both pages", async () => {
    useCases.updateBoard.mockResolvedValue(board);
    expect(await actions.updateBoardAction(undefined, form({ boardId: BOARD_ID, name: "New", description: "Why" }))).toEqual({ ok: true, data: null });
    expect(useCases.updateBoard).toHaveBeenCalledWith({ boardId: BOARD_ID, name: "New", description: "Why" });
    expect(revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual(["/boards", `/boards/${BOARD_ID}`, `/boards/${BOARD_ID}/settings`].sort());
  });

  it("returns field errors and permission failures as state", async () => {
    useCases.updateBoard.mockRejectedValueOnce(new ValidationError("Invalid input", { name: ["Name is required"] }));
    expect(await actions.updateBoardAction(undefined, form({ boardId: BOARD_ID, name: "" }))).toMatchObject({ fieldErrors: { name: ["Name is required"] } });
    useCases.updateBoard.mockRejectedValueOnce(new ForbiddenError());
    expect(await actions.updateBoardAction(undefined, form({ boardId: BOARD_ID, name: "x" }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("setBoardStatusAction", () => {
  it("archives and restores through the update use case", async () => {
    useCases.updateBoard.mockResolvedValue(board);
    await actions.setBoardStatusAction(undefined, form({ boardId: BOARD_ID, status: "inactive" }));
    expect(useCases.updateBoard).toHaveBeenCalledWith({ boardId: BOARD_ID, status: "inactive" });
  });

  it("never lets an arbitrary status through: the use case validates it", async () => {
    useCases.updateBoard.mockRejectedValue(new ValidationError("Invalid input", { status: ["Invalid option"] }));
    expect(await actions.setBoardStatusAction(undefined, form({ boardId: BOARD_ID, status: "deleted" }))).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("deleteBoardAction", () => {
  it("does nothing until the confirmation is ticked", async () => {
    const result = await actions.deleteBoardAction(undefined, form({ boardId: BOARD_ID }));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { confirm: ["Confirm that you want to delete this board"] } });
    expect(useCases.deleteBoard).not.toHaveBeenCalled();
  });

  it("deletes and returns to the board list once confirmed", async () => {
    useCases.deleteBoard.mockResolvedValue(undefined);
    await expect(actions.deleteBoardAction(undefined, form({ boardId: BOARD_ID, confirm: "yes" }))).rejects.toMatchObject({ digest: expect.stringContaining("/boards;") });
    expect(useCases.deleteBoard).toHaveBeenCalledWith({ boardId: BOARD_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/boards");
  });

  it("sends a signed-out caller to login and reports foreign boards as not found", async () => {
    useCases.deleteBoard.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(actions.deleteBoardAction(undefined, form({ boardId: BOARD_ID, confirm: "yes" }))).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    useCases.deleteBoard.mockRejectedValueOnce(new NotFoundError());
    expect(await actions.deleteBoardAction(undefined, form({ boardId: BOARD_ID, confirm: "yes" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
