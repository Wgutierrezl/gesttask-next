import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/_actions/boards", () => ({ createBoardAction: async () => undefined }));
vi.mock("@/app/_actions/auth", () => ({ signOutAction: async () => undefined }));

const getActor = vi.fn();
const useCases = { listMyBoards: vi.fn(), listMyMemberships: vi.fn(), createBoard: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { PAGE_SIZE, parsePage, pageWindow, slicePage } = await import("@/app/_shared/pagination");
const { BoardCard } = await import("@/components/boards/board-card");
const { CreateBoardForm } = await import("@/components/boards/create-board-form");
const { GuestBanner } = await import("@/components/boards/guest-banner");
const { Pager } = await import("@/components/boards/pager");
const { default: BoardsPage } = await import("@/app/(app)/boards/page");
const { default: AppLayout } = await import("@/app/(app)/layout");
const { createBoardAction } = await vi.importActual<typeof import("@/app/_actions/boards")>("@/app/_actions/boards");

const board = (n: number, extra = {}) => ({ id: `b${n}`, name: `Board ${n}`, description: "", status: "active", createdAt: new Date(), ...extra });
const search = (page?: string) => Promise.resolve({ page });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.listMyBoards.mockResolvedValue([]);
  useCases.listMyMemberships.mockResolvedValue([]);
});

describe("pagination helpers", () => {
  it.each([[undefined, 1], ["3", 3], ["0", 1], ["-2", 1], ["abc", 1], ["2.5", 1], [["4", "5"], 4], ["99999999", 1000]])("parsePage(%j) is %j", (raw, page) => {
    expect(parsePage(raw as string | undefined)).toBe(page);
  });

  it("asks for one row more than a page so it can tell whether another page exists", () => {
    expect(pageWindow(1)).toEqual({ limit: PAGE_SIZE + 1, offset: 0 });
    expect(pageWindow(3)).toEqual({ limit: PAGE_SIZE + 1, offset: 2 * PAGE_SIZE });
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_v, i) => i);
    expect(slicePage(rows)).toEqual({ items: rows.slice(0, PAGE_SIZE), hasNext: true });
    expect(slicePage([1, 2])).toEqual({ items: [1, 2], hasNext: false });
  });
});

describe("components", () => {
  it("BoardCard links to the board and shows role and archived state", () => {
    const html = renderToStaticMarkup(<BoardCard board={board(1, { description: "Plans", status: "inactive" }) as never} role="member" />);
    expect(html).toContain('href="/boards/b1"');
    expect(html).toContain("Board 1");
    expect(html).toContain("Plans");
    expect(html).toContain("Member");
    expect(html).toContain("Archived");
    expect(renderToStaticMarkup(<BoardCard board={board(2) as never} role="owner" />)).not.toContain("Archived");
  });

  it("CreateBoardForm has labelled fields and a live region for errors", () => {
    const html = renderToStaticMarkup(<CreateBoardForm />);
    expect(html).toContain('for="name"');
    expect(html).toContain('for="description"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Create board");
  });

  it("GuestBanner explains the sandbox and links to sign-up", () => {
    const html = renderToStaticMarkup(<GuestBanner />);
    expect(html).toContain("You&#x27;re exploring a demo sandbox");
    expect(html).toContain("data resets in 24h");
    expect(html).toContain('href="/register"');
  });

  it("Pager renders only the links that lead somewhere", () => {
    expect(renderToStaticMarkup(<Pager page={1} hasNext={false} basePath="/boards" />)).toBe("");
    const middle = renderToStaticMarkup(<Pager page={2} hasNext basePath="/boards" />);
    expect(middle).toContain('href="/boards"'); // page 1 has no query
    expect(middle).toContain('href="/boards?page=3"');
    expect(renderToStaticMarkup(<Pager page={1} hasNext basePath="/boards" />)).not.toContain("Previous");
  });
});

describe("BoardsPage", () => {
  it("lists the caller's boards with their roles", async () => {
    useCases.listMyBoards.mockResolvedValue([board(1), board(2)]);
    useCases.listMyMemberships.mockResolvedValue([{ boardId: "b1", userId: "u", role: "owner" }, { boardId: "b2", userId: "u", role: "guest" }]);
    const html = renderToStaticMarkup(await BoardsPage({ searchParams: search() }));
    expect(html).toContain("Board 1");
    expect(html).toContain("Owner");
    expect(html).toContain("Board 2");
    expect(html).toContain("Viewer");
    expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: PAGE_SIZE + 1, offset: 0 });
  });

  it("loads roles only for the boards shown, never the caller's whole membership list", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_v, i) => board(i));
    useCases.listMyBoards.mockResolvedValue(rows);
    renderToStaticMarkup(await BoardsPage({ searchParams: search() }));
    expect(useCases.listMyMemberships).toHaveBeenCalledWith({ boardIds: rows.slice(0, PAGE_SIZE).map((b) => b.id) });
  });

  it("does not look up roles when there are no boards", async () => {
    renderToStaticMarkup(await BoardsPage({ searchParams: search() }));
    expect(useCases.listMyMemberships).not.toHaveBeenCalled();
  });

  it("shows an empty state with the create form", async () => {
    const html = renderToStaticMarkup(await BoardsPage({ searchParams: search() }));
    expect(html).toContain("You have no boards yet");
    expect(html).toContain("Create board");
  });

  it("pages through boards and offers Next only when another page exists", async () => {
    useCases.listMyBoards.mockResolvedValue(Array.from({ length: PAGE_SIZE + 1 }, (_v, i) => board(i)));
    const html = renderToStaticMarkup(await BoardsPage({ searchParams: search("2") }));
    expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: PAGE_SIZE + 1, offset: PAGE_SIZE });
    expect(html).toContain('href="/boards?page=3"');
    expect(html).toContain('href="/boards"');
    expect(html).not.toContain(`Board ${PAGE_SIZE}<`); // the lookahead row is not shown
  });

  it("sends visitors without a session to the login page before loading anything", async () => {
    getActor.mockResolvedValue(null);
    await expect(BoardsPage({ searchParams: search() })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
    expect(useCases.listMyBoards).not.toHaveBeenCalled();
  });
});

describe("app layout", () => {
  it("shows the demo banner to guests only", async () => {
    getActor.mockResolvedValue({ userId: "g", isGuest: true });
    expect(renderToStaticMarkup(await AppLayout({ children: <p>content</p> }))).toContain("demo sandbox");
    getActor.mockResolvedValue({ userId: "u", isGuest: false });
    const html = renderToStaticMarkup(await AppLayout({ children: <p>content</p> }));
    expect(html).not.toContain("demo sandbox");
    expect(html).toContain("content");
  });
});

describe("createBoardAction", () => {
  const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

  it("creates the board from the form and redirects to it", async () => {
    useCases.createBoard.mockResolvedValue(board(7));
    await expect(createBoardAction(undefined, form({ name: "Roadmap", description: "Q4" }))).rejects.toMatchObject({ digest: expect.stringContaining("/boards/b7") });
    expect(useCases.createBoard).toHaveBeenCalledWith({ name: "Roadmap", description: "Q4" });
    expect(revalidatePath).toHaveBeenCalledWith("/boards");
  });

  it("returns field errors and quota conflicts as state", async () => {
    useCases.createBoard.mockRejectedValueOnce(new ValidationError("Invalid input", { name: ["Name is required"] }));
    expect(await createBoardAction(undefined, form({ name: "" }))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { name: ["Name is required"] } });
    useCases.createBoard.mockRejectedValueOnce(new ConflictError("Demo accounts can own at most 3 boards"));
    expect(await createBoardAction(undefined, form({ name: "x" }))).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});
