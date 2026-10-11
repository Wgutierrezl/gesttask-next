import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/infrastructure/db/schema";
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
const boardRoute = await import("@/app/api/v1/boards/[boardId]/route");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const MISSING = "00000000-0000-4000-8000-00000000ffff";

let owner: ApiUser;
let member: ApiUser;
let rival: ApiUser;
let boardId: string;

const createBoard = async (user: ApiUser, name = "Roadmap") => (await (await call(boardsRoute.POST, "POST", user, { body: { name } })).json()).id as string;

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
  member = await signUpUser(auth, "member@example.com");
  rival = await signUpUser(auth, "rival@example.com");
  boardId = await createBoard(owner);
  await handle.db.insert(schema.boardMembers).values({ boardId, userId: member.userId, role: "member" });
});
afterAll(() => handle.close());

describe("boards", () => {
  it("createBoard answers 201 with the board; the creator is its owner (getBoard)", async () => {
    const created = await expectDocumented("createBoard", await call(boardsRoute.POST, "POST", owner, { body: { name: "Plan", description: "Q4" } }));
    expect(created).toMatchObject({ name: "Plan", description: "Q4", status: "active" });
    const got = await expectDocumented("getBoard", await call(boardRoute.GET, "GET", owner, { params: { boardId: created.id } }));
    expect(got.role).toBe("owner");
  });

  it("createBoard validates with field errors (422) and refuses a body that is not an object (400)", async () => {
    const invalid = await expectError(await call(boardsRoute.POST, "POST", owner, { body: { name: "" } }), 422, "VALIDATION");
    expect(invalid.error.details).toHaveProperty("name");
    await expectError(await call(boardsRoute.POST, "POST", owner, { body: [1] }), 400, "BAD_REQUEST");
  });

  it("listMyBoards lists only your boards, paginated with an opaque cursor, and [] when you have none", async () => {
    await createBoard(owner, "Second");
    await createBoard(owner, "Third");
    const first = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 2 } }));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 2, cursor: first.nextCursor } }));
    expect(second.items).toHaveLength(1); // three boards in all: the one from beforeEach plus two
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((b: { id: string }) => b.id)).size).toBe(3);
    expect((await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", rival))).items).toEqual([]);
    await expectError(await call(boardsRoute.GET, "GET", owner, { query: { limit: 0 } }), 422, "VALIDATION");
    await expectError(await call(boardsRoute.GET, "GET", owner, { query: { cursor: "***" } }), 422, "VALIDATION");
  });

  it("a list that ends exactly on a page boundary has no cursor to an empty page, and paging has a depth cap", async () => {
    await createBoard(owner, "Second");
    const exact = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 2 } }));
    expect(exact.items).toHaveLength(2);
    expect(exact.nextCursor).toBeNull(); // two boards, page of two: nothing follows
    const deep = Buffer.from("10001").toString("base64url");
    const refused = await expectError(await call(boardsRoute.GET, "GET", owner, { query: { cursor: deep } }), 422, "VALIDATION");
    expect(refused.error.details).toHaveProperty("cursor");
  });

  it("at the largest page size the last page still has no cursor when it ends exactly there, and has one when more follow", async () => {
    const seed = async (count: number) => {
      const rows = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), name: `Bulk ${i}`, createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)) }));
      await handle.db.insert(schema.boards).values(rows);
      await handle.db.insert(schema.boardMembers).values(rows.map((row) => ({ boardId: row.id, userId: owner.userId, role: "owner" as const })));
    };
    await seed(198); // plus the board from beforeEach and the member's: the owner has 199
    await createBoard(owner, "The 200th");
    const exact = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 200 } }));
    expect(exact.items).toHaveLength(200);
    expect(exact.nextCursor).toBeNull();
    await seed(1);
    const more = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 200 } }));
    expect(more.items).toHaveLength(200);
    expect(more.nextCursor).toEqual(expect.any(String));
    const rest = await expectDocumented("listMyBoards", await call(boardsRoute.GET, "GET", owner, { query: { limit: 200, cursor: more.nextCursor } }));
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
  });

  it("updateBoard and deleteBoard are owner-only: a member gets 403, the owner succeeds", async () => {
    await expectError(await call(boardRoute.PATCH, "PATCH", member, { params: { boardId }, body: { name: "Mine now" } }), 403, "FORBIDDEN");
    await expectError(await call(boardRoute.DELETE, "DELETE", member, { params: { boardId } }), 403, "FORBIDDEN");
    const updated = await expectDocumented("updateBoard", await call(boardRoute.PATCH, "PATCH", owner, { params: { boardId }, body: { name: "Renamed", status: "inactive" } }));
    expect(updated).toMatchObject({ name: "Renamed", status: "inactive" });
    await expectDocumented("deleteBoard", await call(boardRoute.DELETE, "DELETE", owner, { params: { boardId } }));
    await expectError(await call(boardRoute.GET, "GET", owner, { params: { boardId } }), 404, "NOT_FOUND");
  });

  it("a body cannot aim at another board: the path decides which board is updated", async () => {
    const other = await createBoard(owner, "Other");
    await call(boardRoute.PATCH, "PATCH", owner, { params: { boardId }, body: { boardId: other, name: "Only the path board" } });
    const untouched = await expectDocumented("getBoard", await call(boardRoute.GET, "GET", owner, { params: { boardId: other } }));
    expect(untouched.board.name).toBe("Other");
  });
});

describe("authentication and isolation (REQ-AUTH-04, REQ-ISO-01)", () => {
  it("every board operation answers 401 without a session", async () => {
    const anonymous = [
      ["listMyBoards", () => call(boardsRoute.GET, "GET", null)],
      ["createBoard", () => call(boardsRoute.POST, "POST", null, { body: { name: "x" } })],
      ["getBoard", () => call(boardRoute.GET, "GET", null, { params: { boardId } })],
      ["updateBoard", () => call(boardRoute.PATCH, "PATCH", null, { params: { boardId }, body: { name: "x" } })],
      ["deleteBoard", () => call(boardRoute.DELETE, "DELETE", null, { params: { boardId } })],
    ] as const;
    for (const [name, run] of anonymous) await expectError(await run(), 401, "UNAUTHENTICATED").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
  });

  it("a rival who is not on the board gets 404 for every board-scoped operation, and nothing changes", async () => {
    const asRival = [
      ["getBoard", () => call(boardRoute.GET, "GET", rival, { params: { boardId } })],
      ["updateBoard", () => call(boardRoute.PATCH, "PATCH", rival, { params: { boardId }, body: { name: "stolen" } })],
      ["deleteBoard", () => call(boardRoute.DELETE, "DELETE", rival, { params: { boardId } })],
    ] as const;
    const missingBody = await expectError(await call(boardRoute.GET, "GET", owner, { params: { boardId: MISSING } }), 404, "NOT_FOUND");
    for (const [name, run] of asRival) {
      const body = await expectError(await run(), 404, "NOT_FOUND").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
      // A foreign board and a board that does not exist are the same answer (REQ-ISO-08).
      expect(body.error.message, name).toBe(missingBody.error.message);
    }
    const intact = await expectDocumented("getBoard", await call(boardRoute.GET, "GET", owner, { params: { boardId } }));
    expect(intact.board.name).toBe("Roadmap");
  });

  it("a malformed board id in the path reads as missing (404), never as a validation detail", async () => {
    await expectError(await call(boardRoute.GET, "GET", owner, { params: { boardId: "not-a-uuid" } }), 404, "NOT_FOUND");
  });
});
