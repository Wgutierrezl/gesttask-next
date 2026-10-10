import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, RateLimitError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/app/_actions/boards", () => ({ updateBoardAction: async () => undefined, setBoardStatusAction: async () => undefined, deleteBoardAction: async () => undefined }));
vi.mock("@/app/_actions/members", () => ({ addMemberAction: async () => undefined, changeMemberRoleAction: async () => undefined, removeMemberAction: async () => undefined }));

const getActor = vi.fn();
const useCases = { getBoard: vi.fn(), listMemberProfiles: vi.fn(), addMemberByEmail: vi.fn(), changeMemberRole: vi.fn(), removeMember: vi.fn() };
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ session: { getActor }, useCases, logger }) }));

const { AddMemberForm } = await import("@/components/boards/add-member-form");
const { MemberRow } = await import("@/components/boards/member-row");
const { default: SettingsPage } = await import("@/app/(app)/boards/[boardId]/settings/page");
const actions = await vi.importActual<typeof import("@/app/_actions/members")>("@/app/_actions/members");

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const board = { id: BOARD_ID, name: "Roadmap", description: "", status: "active" as const, createdAt: new Date() };
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());
const olivia = { userId: "u", role: "owner" as const, name: "Olivia", email: "olivia@example.com" };
const mark = { userId: "m", role: "member" as const, name: "Mark", email: "mark@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue({ userId: "u", isGuest: false });
  useCases.getBoard.mockResolvedValue({ board, role: "owner" });
  useCases.listMemberProfiles.mockResolvedValue([olivia, mark]);
});

describe("components", () => {
  it("AddMemberForm asks for an email and a role, and links field errors", () => {
    const html = renderToStaticMarkup(<AddMemberForm boardId={BOARD_ID} />);
    expect(html).toContain('for="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('for="role"');
    expect(html).toContain('<option value="member"');
    expect(html).toContain("Viewer");
    expect(html).toContain("Add member");
    expect(html).toContain(`name="boardId" value="${BOARD_ID}"`);
  });

  it("MemberRow shows who it is and offers role change and removal", () => {
    const html = renderToStaticMarkup(<MemberRow boardId={BOARD_ID} member={mark} />);
    expect(html).toContain("Mark");
    expect(html).toContain("mark@example.com");
    expect(html).toContain('name="userId" value="m"');
    expect(html.match(new RegExp(`name="boardId" value="${BOARD_ID}"`, "g"))).toHaveLength(2);
    expect(html).toContain('for="role-m"');
    expect(html).toContain("Role of Mark</label>");
    expect(html).toContain('<option value="member" selected');
  });

  it("MemberRow gives every control a name that says whom it acts on", () => {
    const html = renderToStaticMarkup(<MemberRow boardId={BOARD_ID} member={mark} />);
    expect(html).toContain('aria-label="Remove Mark"');
    expect(html).toContain('aria-label="Update role for Mark"');
  });

  it("MemberRow asks for confirmation before removal, with stronger words for oneself", () => {
    const other = renderToStaticMarkup(<MemberRow boardId={BOARD_ID} member={mark} />);
    expect(other).toMatch(/<input type="checkbox" required="" [^>]*name="confirm" value="yes"/);
    expect(other).toContain("Mark will lose access to this board");
    const self = renderToStaticMarkup(<MemberRow boardId={BOARD_ID} member={olivia} isSelf />);
    expect(self).toContain("I will lose access to this board");
  });
});

describe("SettingsPage members section", () => {
  it("lists every member with its controls", async () => {
    const html = renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ boardId: BOARD_ID }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Olivia");
    expect(html).toContain("Mark");
    expect(html).toContain("Add member");
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: BOARD_ID, limit: 13, offset: 0 });
  });

  it("marks the signed-in owner's own row so removing oneself is confirmed in stronger words", async () => {
    const html = renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ boardId: BOARD_ID }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("I will lose access to this board");
    expect(html).toContain("Mark will lose access to this board");
  });

  it("pages the members and says so past the end", async () => {
    useCases.listMemberProfiles.mockResolvedValue(Array.from({ length: 13 }, (_v, i) => ({ ...mark, userId: `m${i}`, name: `Person ${i}` })));
    const html = renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ boardId: BOARD_ID }), searchParams: Promise.resolve({ page: "2" }) }));
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: BOARD_ID, limit: 13, offset: 12 });
    expect(html).toContain(`href="/boards/${BOARD_ID}/settings?page=3"`);
    expect(html).not.toContain("Person 12<");
    useCases.listMemberProfiles.mockResolvedValue([]);
    expect(renderToStaticMarkup(await SettingsPage({ params: Promise.resolve({ boardId: BOARD_ID }), searchParams: Promise.resolve({ page: "9" }) }))).toContain("No members on this page");
  });
});

describe("addMemberAction", () => {
  it("invites by email with the chosen role and refreshes the settings", async () => {
    useCases.addMemberByEmail.mockResolvedValue({ boardId: BOARD_ID, userId: "m", role: "member" });
    expect(await actions.addMemberAction(undefined, form({ boardId: BOARD_ID, email: "mark@example.com", role: "member" }))).toEqual({ ok: true, data: null });
    expect(useCases.addMemberByEmail).toHaveBeenCalledWith({ boardId: BOARD_ID, email: "mark@example.com", role: "member" });
    expect(revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual([`/boards/${BOARD_ID}`, `/boards/${BOARD_ID}/settings`].sort());
  });

  it.each([
    [new ValidationError("Invalid input", { email: ["No account found with that email"] }), "VALIDATION"],
    [new ConflictError("User is already a member of this board"), "CONFLICT"],
    [new ForbiddenError("Create an account to invite people"), "FORBIDDEN"],
    [new RateLimitError(600), "RATE_LIMITED"],
  ])("reports %s as state", async (error, code) => {
    useCases.addMemberByEmail.mockRejectedValueOnce(error);
    expect(await actions.addMemberAction(undefined, form({ boardId: BOARD_ID, email: "x@example.com", role: "member" }))).toMatchObject({ ok: false, code });
  });
});

describe("changeMemberRoleAction", () => {
  it("changes the role of another member and stays on the settings page", async () => {
    useCases.changeMemberRole.mockResolvedValue({ boardId: BOARD_ID, userId: "m", role: "guest" });
    expect(await actions.changeMemberRoleAction(undefined, form({ boardId: BOARD_ID, userId: "m", role: "guest" }))).toEqual({ ok: true, data: null });
    expect(useCases.changeMemberRole).toHaveBeenCalledWith({ boardId: BOARD_ID, userId: "m", role: "guest" });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual([`/boards/${BOARD_ID}`, `/boards/${BOARD_ID}/settings`].sort());
  });

  it("goes to the board page when an owner demotes themselves, since settings are no longer theirs", async () => {
    useCases.changeMemberRole.mockResolvedValue({ boardId: BOARD_ID, userId: "u", role: "member" });
    await expect(actions.changeMemberRoleAction(undefined, form({ boardId: BOARD_ID, userId: "u", role: "member" }))).rejects.toMatchObject({ digest: expect.stringContaining(`/boards/${BOARD_ID};`) });
  });

  it("stays on the settings page when the owner keeps their own owner role (no-op)", async () => {
    useCases.changeMemberRole.mockResolvedValue({ boardId: BOARD_ID, userId: "u", role: "owner" });
    expect(await actions.changeMemberRoleAction(undefined, form({ boardId: BOARD_ID, userId: "u", role: "owner" }))).toEqual({ ok: true, data: null });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a session lookup failure as state instead of throwing", async () => {
    getActor.mockRejectedValue(new Error("db down"));
    expect(await actions.changeMemberRoleAction(undefined, form({ boardId: BOARD_ID, userId: "u", role: "member" }))).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(useCases.changeMemberRole).not.toHaveBeenCalled();
  });

  it("surfaces the last-owner guard as a plain message", async () => {
    useCases.changeMemberRole.mockRejectedValue(new ConflictError("A board needs at least one owner"));
    expect(await actions.changeMemberRoleAction(undefined, form({ boardId: BOARD_ID, userId: "u", role: "member" }))).toEqual({ ok: false, code: "CONFLICT", message: "A board needs at least one owner" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("removeMemberAction", () => {
  it("removes another member and refreshes", async () => {
    useCases.removeMember.mockResolvedValue(undefined);
    expect(await actions.removeMemberAction(undefined, form({ boardId: BOARD_ID, userId: "m", confirm: "yes" }))).toEqual({ ok: true, data: null });
    expect(useCases.removeMember).toHaveBeenCalledWith({ boardId: BOARD_ID, userId: "m" });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual([`/boards/${BOARD_ID}`, `/boards/${BOARD_ID}/settings`, "/boards"].sort());
  });

  it("reports a session lookup failure as state instead of throwing", async () => {
    getActor.mockRejectedValue(new Error("db down"));
    expect(await actions.removeMemberAction(undefined, form({ boardId: BOARD_ID, userId: "u", confirm: "yes" }))).toMatchObject({ ok: false, code: "INTERNAL" });
    expect(useCases.removeMember).not.toHaveBeenCalled();
  });

  it("refuses to remove anyone without the confirmation, before touching the board", async () => {
    expect(await actions.removeMemberAction(undefined, form({ boardId: BOARD_ID, userId: "m" }))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { confirm: [expect.any(String)] } });
    expect(useCases.removeMember).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns to the board list after the owner removes themselves", async () => {
    useCases.removeMember.mockResolvedValue(undefined);
    await expect(actions.removeMemberAction(undefined, form({ boardId: BOARD_ID, userId: "u", confirm: "yes" }))).rejects.toMatchObject({ digest: expect.stringContaining("/boards;") });
  });

  it("explains the last-owner guard instead of failing", async () => {
    useCases.removeMember.mockRejectedValue(new ConflictError("A board needs at least one owner"));
    expect(await actions.removeMemberAction(undefined, form({ boardId: BOARD_ID, userId: "u", confirm: "yes" }))).toMatchObject({ ok: false, code: "CONFLICT", message: "A board needs at least one owner" });
  });
});
