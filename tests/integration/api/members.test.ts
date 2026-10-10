import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authFixture } from "../support/auth";
import { apiCaller, expectDocumented, expectError, signUpUser, type ApiUser } from "../support/api";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
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

const boardsRoute = await import("@/app/api/v1/boards/route");
const membersRoute = await import("@/app/api/v1/boards/[boardId]/members/route");
const memberRoute = await import("@/app/api/v1/boards/[boardId]/members/[userId]/route");
const membershipsRoute = await import("@/app/api/v1/me/memberships/route");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);

let owner: ApiUser;
let member: ApiUser;
let rival: ApiUser;
let boardId: string;

const createBoard = async (user: ApiUser, name = "Roadmap") => (await (await call(boardsRoute.POST, "POST", user, { body: { name } })).json()).id as string;
const addMember = (user: ApiUser | null, id: string, email: string, role = "member") => call(membersRoute.POST, "POST", user, { params: { boardId: id }, body: { email, role } });

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
  member = await signUpUser(auth, "member@example.com");
  rival = await signUpUser(auth, "rival@example.com");
  boardId = await createBoard(owner);
  await addMember(owner, boardId, "member@example.com");
});
afterAll(() => handle.close());

describe("members", () => {
  it("listMemberProfiles shows names to every member and emails only to the owner", async () => {
    const asOwner = await expectDocumented("listMemberProfiles", await call(membersRoute.GET, "GET", owner, { params: { boardId } }));
    expect(asOwner.items.map((m: { email: string }) => m.email).sort()).toEqual(["member@example.com", "owner@example.com"]);
    const asMember = await expectDocumented("listMemberProfiles", await call(membersRoute.GET, "GET", member, { params: { boardId } }));
    expect(asMember.items.map((m: { name: string }) => m.name).sort()).toEqual(["member", "owner"]);
    expect(asMember.items.every((m: { email: unknown }) => m.email === null)).toBe(true);
  });

  it("addMemberByEmail answers 201, a duplicate is a 409, a plain member may not add (403)", async () => {
    const added = await expectDocumented("addMemberByEmail", await addMember(owner, boardId, "rival@example.com", "guest"));
    expect(added).toMatchObject({ boardId, userId: rival.userId, role: "guest" });
    await expectError(await addMember(owner, boardId, "rival@example.com"), 409, "CONFLICT");
    await expectError(await addMember(member, boardId, "owner@example.com"), 403, "FORBIDDEN");
  });

  it("changeMemberRole and removeMember work for the owner; the last owner cannot leave (409)", async () => {
    const changed = await expectDocumented("changeMemberRole", await call(memberRoute.PATCH, "PATCH", owner, { params: { boardId, userId: member.userId }, body: { role: "guest" } }));
    expect(changed.role).toBe("guest");
    await expectError(await call(memberRoute.PATCH, "PATCH", member, { params: { boardId, userId: member.userId }, body: { role: "owner" } }), 403, "FORBIDDEN");
    await expectDocumented("removeMember", await call(memberRoute.DELETE, "DELETE", owner, { params: { boardId, userId: member.userId } }));
    await expectError(await call(memberRoute.DELETE, "DELETE", owner, { params: { boardId, userId: owner.userId } }), 409, "CONFLICT");
  });

  it("listMyMemberships lists your own memberships and takes no user to aim at", async () => {
    const mine = await expectDocumented("listMyMemberships", await call(membershipsRoute.GET, "GET", member));
    expect(mine.items).toEqual([{ boardId, userId: member.userId, role: "member" }]);
    expect(mine.nextCursor).toBeNull();
    const aimed = await expectDocumented("listMyMemberships", await call(membershipsRoute.GET, "GET", rival, { query: { userId: owner.userId } }));
    expect(aimed.items).toEqual([]);
  });
});

describe("authentication and isolation (REQ-AUTH-04, REQ-ISO-01)", () => {
  it("every member operation answers 401 without a session", async () => {
    const userId = member.userId;
    const anonymous = [
      ["listMemberProfiles", () => call(membersRoute.GET, "GET", null, { params: { boardId } })],
      ["addMemberByEmail", () => addMember(null, boardId, "rival@example.com")],
      ["changeMemberRole", () => call(memberRoute.PATCH, "PATCH", null, { params: { boardId, userId }, body: { role: "guest" } })],
      ["removeMember", () => call(memberRoute.DELETE, "DELETE", null, { params: { boardId, userId } })],
      ["listMyMemberships", () => call(membershipsRoute.GET, "GET", null)],
    ] as const;
    for (const [name, run] of anonymous) await expectError(await run(), 401, "UNAUTHENTICATED").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
  });

  it("a rival who is not on the board gets 404 for every member operation, and nothing changes", async () => {
    const asRival = [
      ["listMemberProfiles", () => call(membersRoute.GET, "GET", rival, { params: { boardId } })],
      ["addMemberByEmail", () => addMember(rival, boardId, "rival@example.com")],
      ["changeMemberRole", () => call(memberRoute.PATCH, "PATCH", rival, { params: { boardId, userId: member.userId }, body: { role: "owner" } })],
      ["removeMember", () => call(memberRoute.DELETE, "DELETE", rival, { params: { boardId, userId: member.userId } })],
    ] as const;
    for (const [name, run] of asRival) await expectError(await run(), 404, "NOT_FOUND").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
    const people = await expectDocumented("listMemberProfiles", await call(membersRoute.GET, "GET", owner, { params: { boardId } }));
    expect(people.items.map((m: { userId: string; role: string }) => [m.userId, m.role]).sort()).toEqual([[member.userId, "member"], [owner.userId, "owner"]].sort());
  });
});
