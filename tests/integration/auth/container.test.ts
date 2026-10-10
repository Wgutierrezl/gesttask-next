import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, UnauthenticatedError } from "@/domain/errors";
import { buildContainer } from "@/infrastructure/container";
import { sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import { connectTestDb, resetDb, testDatabaseUrl } from "../support/db";
import { authFixture, cookieHeader } from "../support/auth";
import { drizzleDeps } from "../support/tx";
import { SeededGuestSandbox } from "@/infrastructure/auth/guest-sandbox";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const handle = connectTestDb();
const container = buildContainer({
  DB_DRIVER: "pg",
  DATABASE_URL: testDatabaseUrl(),
  STORAGE_DRIVER: "local",
  BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  TRUSTED_PROXY_HOPS: "1", // one trusted proxy: the last x-forwarded-for entry is the client
});
const from = (ip: string) => void (request.headers = new Headers({ "x-forwarded-for": ip }));
const count = async (table: string) => Number((await handle.db.execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`))).rows[0]?.n);

beforeEach(async () => {
  await resetDb(handle);
  request.headers = new Headers();
});
afterAll(async () => {
  await container.close();
  await handle.close();
});

describe("container auth flows on Postgres", () => {
  it("guest login creates the guest and its sandbox board", async () => {
    from("203.0.113.1");
    const guest = await container.auth.signInGuest();
    expect(guest.isGuest).toBe(true);
    const { rows } = await handle.db.execute<{ role: string }>(sql`SELECT role FROM board_members WHERE board_id = ${sandboxBoardId(guest.userId)} AND user_id = ${guest.userId}`);
    expect(rows[0]?.role).toBe("owner");
  });

  it("allows 5 guest logins per client per hour, then answers 429 without creating a user (REQ-SEC-03)", async () => {
    from("203.0.113.2");
    for (let i = 0; i < 5; i++) await container.auth.signInGuest();
    const users = await count("user");
    const failure = await container.auth.signInGuest().catch((e) => e);
    expect(failure).toBeInstanceOf(RateLimitError);
    expect(failure.retryAfterSeconds).toBeGreaterThan(0);
    expect(await count("user")).toBe(users);
    from("203.0.113.3");
    await expect(container.auth.signInGuest()).resolves.toMatchObject({ isGuest: true });
  });

  it("registers, rejects duplicates, and answers bad credentials generically until the attempt limit", async () => {
    from("203.0.113.4");
    const input = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };
    const created = await container.auth.signUp(input);
    await expect(container.auth.signUp(input)).rejects.toBeInstanceOf(ConflictError);
    await expect(container.auth.signInEmail({ email: input.email, password: input.password })).resolves.toEqual(created);

    const wrong = { email: input.email, password: "not the password" };
    const results: unknown[] = [];
    for (let i = 0; i < 8; i++) results.push(await container.auth.signInEmail(wrong).catch((e) => e));
    expect(results.every((r) => r instanceof UnauthenticatedError)).toBe(true); // 1 success + 8 failures = 9 attempts
    await expect(container.auth.signInEmail(wrong)).rejects.toBeInstanceOf(UnauthenticatedError); // 10th
    await expect(container.auth.signInEmail(wrong)).rejects.toBeInstanceOf(RateLimitError); // 11th
    await expect(container.auth.signInEmail({ email: input.email, password: input.password })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("never stores the raw client address in rate limit keys", async () => {
    from("198.51.100.77");
    await container.auth.signInGuest();
    const { rows } = await handle.db.execute<{ key: string }>(sql`SELECT key FROM rate_limits`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.key.includes("198.51.100.77"))).toBe(true);
  });
});

describe("container use cases on Postgres (real sessions)", () => {
  const { auth } = authFixture(handle);
  const browser = (headers: Headers) => void (request.headers = headers);

  async function guest() {
    const response = await auth.api.signInAnonymous({ returnHeaders: true });
    const user = { userId: response.response!.user.id, isGuest: true };
    const deps = drizzleDeps(handle);
    await new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision(user);
    return { headers: cookieHeader(response.headers), boardId: sandboxBoardId(user.userId) };
  }

  async function account(email: string) {
    const response = await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: email.split("@")[0]! }, returnHeaders: true });
    return { headers: cookieHeader(response.headers), userId: response.response.user.id };
  }

  it("shows a guest their own sandbox, with member names but no emails for demo accounts", async () => {
    const a = await guest();
    browser(a.headers);
    const boards = await container.useCases.listMyBoards({});
    expect(boards.map((b) => b.id)).toEqual([a.boardId]);
    expect((await container.useCases.getBoard({ boardId: a.boardId })).role).toBe("owner");
    const members = await container.useCases.listMemberProfiles({ boardId: a.boardId });
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.every((m) => m.name.length > 0 && m.email === null)).toBe(true);
  });

  it("answers NotFound to another browser on every board use case and leaves the board intact (REQ-ISO)", async () => {
    const [a, b] = [await guest(), await guest()];
    browser(b.headers);
    const attempts = [
      () => container.useCases.getBoard({ boardId: a.boardId }),
      () => container.useCases.listMemberProfiles({ boardId: a.boardId }),
      () => container.useCases.listPipelines({ boardId: a.boardId }),
      () => container.useCases.updateBoard({ boardId: a.boardId, name: "pwned" }),
      () => container.useCases.deleteBoard({ boardId: a.boardId }),
      () => container.useCases.addMemberByEmail({ boardId: a.boardId, email: "x@example.com", role: "member" }),
    ];
    for (const attempt of attempts) expect(await attempt().catch((e) => e)).toBeInstanceOf(NotFoundError);
    browser(a.headers);
    expect((await container.useCases.getBoard({ boardId: a.boardId })).board.name).not.toBe("pwned");
  });

  it("rejects a request without a session on protected use cases", async () => {
    browser(new Headers());
    await expect(container.useCases.listMyBoards({})).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("lets a registered owner invite an account by email, but never a demo session", async () => {
    const owner = await account("owner@example.com");
    const invitee = await account("invitee@example.com");
    browser(owner.headers);
    const board = await container.useCases.createBoard({ name: "Team" });
    const added = await container.useCases.addMemberByEmail({ boardId: board.id, email: "Invitee@Example.com", role: "member" });
    expect(added).toEqual({ boardId: board.id, userId: invitee.userId, role: "member" });
    expect(await container.useCases.addMemberByEmail({ boardId: board.id, email: "Invitee@Example.com", role: "member" }).catch((e) => e)).toBeInstanceOf(ConflictError);

    const g = await guest();
    browser(g.headers);
    expect(await container.useCases.addMemberByEmail({ boardId: g.boardId, email: "owner@example.com", role: "member" }).catch((e) => e)).toBeInstanceOf(ForbiddenError);
  });
});
