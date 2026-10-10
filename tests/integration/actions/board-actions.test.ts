import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { authFixture, cookieHeader } from "../support/auth";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  const { testDatabaseUrl: url } = await import("../support/db");
  let container: ReturnType<typeof actual.buildContainer> | undefined;
  return {
    ...actual,
    getContainer: () =>
      (container ??= actual.buildContainer({
        DB_DRIVER: "pg",
        DATABASE_URL: url(),
        STORAGE_DRIVER: "local",
        BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
        BETTER_AUTH_URL: "http://localhost:3000",
      })),
  };
});

const boards = await import("@/app/_actions/boards");
const members = await import("@/app/_actions/members");
const pipelines = await import("@/app/_actions/pipelines");
const { getContainer } = await import("@/infrastructure/container");
const { default: BoardsPage } = await import("@/app/(app)/boards/page");
const { default: BoardPage } = await import("@/app/(app)/boards/[boardId]/page");
const { default: SettingsPage } = await import("@/app/(app)/boards/[boardId]/settings/page");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());
const as = (headers: Headers) => void (request.headers = headers);
/** What a Server Action throws to navigate: the framework's redirect, identified by its digest. */
const redirected = (promise: Promise<unknown>) => promise.then(() => "", (e: { digest?: string }) => e.digest ?? String(e));

async function guest() {
  const response = await auth.api.signInAnonymous({ returnHeaders: true });
  const user = { userId: response.response!.user.id, isGuest: true };
  const deps = drizzleDeps(handle);
  await new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision(user);
  return { headers: cookieHeader(response.headers), boardId: sandboxBoardId(user.userId), userId: user.userId };
}

async function account(email: string) {
  const response = await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: email.split("@")[0]! }, returnHeaders: true });
  return { headers: cookieHeader(response.headers), userId: response.response.user.id };
}

const boardRow = async (id: string) => (await handle.db.select().from(schema.boards).where(eq(schema.boards.id, id)))[0];
const roleOf = async (boardId: string, userId: string) =>
  (await handle.db.select().from(schema.boardMembers).where(eq(schema.boardMembers.boardId, boardId)).then((rows) => rows.find((r) => r.userId === userId)))?.role;

beforeEach(async () => {
  await resetDb(handle);
  as(new Headers());
});
afterAll(async () => {
  await getContainer().close();
  await handle.close();
});

describe("board actions on Postgres", () => {
  it("creates a board as the signed-in user and redirects to it", async () => {
    const owner = await account("owner@example.com");
    as(owner.headers);
    const digest = await redirected(boards.createBoardAction(undefined, form({ name: "Roadmap", description: "Q4" })));
    const [created] = await handle.db.select().from(schema.boards).where(eq(schema.boards.name, "Roadmap"));
    expect(digest).toContain(`/boards/${created!.id}`);
    expect(await roleOf(created!.id, owner.userId)).toBe("owner");
  });

  it("returns field errors, and stops a demo user at the board quota with a readable message", async () => {
    const g = await guest();
    as(g.headers);
    expect(await boards.createBoardAction(undefined, form({ name: "  " }))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { name: ["Name is required"] } });
    await redirected(boards.createBoardAction(undefined, form({ name: "Two" })));
    await redirected(boards.createBoardAction(undefined, form({ name: "Three" })));
    const fourth = await boards.createBoardAction(undefined, form({ name: "Four" }));
    expect(fourth).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("Sign up to create more") });
  });

  it("lets only the owner rename, archive and delete; others and strangers get NotFound or Forbidden and nothing changes", async () => {
    const [a, b] = [await guest(), await guest()];
    as(b.headers);
    for (const attempt of [
      () => boards.updateBoardAction(undefined, form({ boardId: a.boardId, name: "pwned" })),
      () => boards.setBoardStatusAction(undefined, form({ boardId: a.boardId, status: "inactive" })),
      () => boards.deleteBoardAction(undefined, form({ boardId: a.boardId, confirm: "yes" })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "NOT_FOUND", message: "Resource not found" });
    expect(await boardRow(a.boardId)).toMatchObject({ status: "active" });
    expect((await boardRow(a.boardId))?.name).not.toBe("pwned");

    as(a.headers);
    expect(await boards.updateBoardAction(undefined, form({ boardId: a.boardId, name: "Renamed", description: "d" }))).toEqual({ ok: true, data: null });
    await boards.setBoardStatusAction(undefined, form({ boardId: a.boardId, status: "inactive" }));
    expect(await boardRow(a.boardId)).toMatchObject({ name: "Renamed", status: "inactive" });
    expect(await redirected(boards.deleteBoardAction(undefined, form({ boardId: a.boardId, confirm: "yes" })))).toContain("/boards;");
    expect(await boardRow(a.boardId)).toBeUndefined();
  });

  it("sends every action to the login page when there is no session", async () => {
    const g = await guest();
    as(new Headers());
    const attempts = [
      boards.createBoardAction(undefined, form({ name: "x" })),
      boards.updateBoardAction(undefined, form({ boardId: g.boardId, name: "x" })),
      boards.deleteBoardAction(undefined, form({ boardId: g.boardId, confirm: "yes" })),
      members.addMemberAction(undefined, form({ boardId: g.boardId, email: "a@b.co", role: "member" })),
      members.removeMemberAction(undefined, form({ boardId: g.boardId, userId: g.userId })),
      pipelines.createPipelineAction(undefined, form({ boardId: g.boardId, name: "x" })),
    ];
    for (const digest of await Promise.all(attempts.map(redirected))) expect(digest).toContain("/login");
    expect(await boardRow(g.boardId)).toBeDefined();
  });
});

describe("member and pipeline actions on Postgres", () => {
  async function team() {
    const [owner, invitee, stranger] = [await account("owner@example.com"), await account("invitee@example.com"), await account("stranger@example.com")];
    as(owner.headers);
    const digest = await redirected(boards.createBoardAction(undefined, form({ name: "Team" })));
    const boardId = digest.split("/boards/")[1]!.split(";")[0]!;
    return { owner, invitee, stranger, boardId };
  }

  it("runs the member lifecycle: invite, change role, remove, with the last-owner guard", async () => {
    const t = await team();
    expect(await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "Invitee@Example.com", role: "member" }))).toEqual({ ok: true, data: null });
    expect(await roleOf(t.boardId, t.invitee.userId)).toBe("member");
    expect(await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "invitee@example.com", role: "member" }))).toMatchObject({ code: "CONFLICT" });
    expect(await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "nobody@example.com", role: "member" }))).toMatchObject({ fieldErrors: { email: ["No account found with that email"] } });

    await members.changeMemberRoleAction(undefined, form({ boardId: t.boardId, userId: t.invitee.userId, role: "guest" }));
    expect(await roleOf(t.boardId, t.invitee.userId)).toBe("guest");

    expect(await members.removeMemberAction(undefined, form({ boardId: t.boardId, userId: t.owner.userId }))).toEqual({ ok: false, code: "CONFLICT", message: "A board needs at least one owner" });
    expect(await members.changeMemberRoleAction(undefined, form({ boardId: t.boardId, userId: t.owner.userId, role: "member" }))).toMatchObject({ code: "CONFLICT" });
    expect(await roleOf(t.boardId, t.owner.userId)).toBe("owner");

    expect(await members.removeMemberAction(undefined, form({ boardId: t.boardId, userId: t.invitee.userId }))).toEqual({ ok: true, data: null });
    expect(await roleOf(t.boardId, t.invitee.userId)).toBeUndefined();
  });

  it("keeps non-owners out: members are Forbidden, strangers NotFound, for members and pipelines alike", async () => {
    const t = await team();
    await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "invitee@example.com", role: "member" }));

    as(t.invitee.headers);
    expect(await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "stranger@example.com", role: "member" }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await members.removeMemberAction(undefined, form({ boardId: t.boardId, userId: t.owner.userId }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await pipelines.createPipelineAction(undefined, form({ boardId: t.boardId, name: "P" }))).toMatchObject({ code: "FORBIDDEN" });

    as(t.stranger.headers);
    expect(await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "stranger@example.com", role: "owner" }))).toMatchObject({ code: "NOT_FOUND" });
    expect(await members.changeMemberRoleAction(undefined, form({ boardId: t.boardId, userId: t.invitee.userId, role: "owner" }))).toMatchObject({ code: "NOT_FOUND" });
    expect(await pipelines.createPipelineAction(undefined, form({ boardId: t.boardId, name: "P" }))).toMatchObject({ code: "NOT_FOUND" });
    expect(await roleOf(t.boardId, t.stranger.userId)).toBeUndefined();
    expect(await handle.db.select().from(schema.pipelines)).toHaveLength(0);
  });

  it("creates a pipeline with the default stages", async () => {
    const t = await team();
    expect(await pipelines.createPipelineAction(undefined, form({ boardId: t.boardId, name: "Sprint", description: "Two weeks" }))).toEqual({ ok: true, data: null });
    const stages = await handle.db.select().from(schema.stages);
    expect(stages.map((s) => s.name).sort()).toEqual(["Done", "In progress", "To do"]);
    expect(stages.filter((s) => s.isDone).map((s) => s.name)).toEqual(["Done"]);
  });

  it("lets an owner who removes themselves leave for the board list", async () => {
    const t = await team();
    await members.addMemberAction(undefined, form({ boardId: t.boardId, email: "invitee@example.com", role: "owner" }));
    expect(await redirected(members.removeMemberAction(undefined, form({ boardId: t.boardId, userId: t.owner.userId })))).toContain("/boards;");
    expect(await roleOf(t.boardId, t.owner.userId)).toBeUndefined();
  });
});

describe("pages on Postgres", () => {
  const text = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

  it("renders a guest's own boards and the board page, and the 404 for somebody else's board", async () => {
    const [a, b] = [await guest(), await guest()];
    as(a.headers);
    const list = await BoardsPage({ searchParams: Promise.resolve({}) });
    expect(text(list)).toContain("Your boards");
    expect(text(await BoardPage({ params: Promise.resolve({ boardId: a.boardId }) }))).toContain("Pipelines");
    expect(text(await SettingsPage({ params: Promise.resolve({ boardId: a.boardId }) }))).toContain("Delete board");

    as(b.headers);
    for (const render of [
      () => BoardPage({ params: Promise.resolve({ boardId: a.boardId }) }),
      () => SettingsPage({ params: Promise.resolve({ boardId: a.boardId }) }),
      () => BoardPage({ params: Promise.resolve({ boardId: "not-a-uuid" }) }),
    ]) await expect(render()).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    as(new Headers());
    await expect(BoardsPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });
});
