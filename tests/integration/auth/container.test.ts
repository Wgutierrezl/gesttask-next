import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { ConflictError, RateLimitError, UnauthenticatedError } from "@/domain/errors";
import { buildContainer } from "@/infrastructure/container";
import { sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import { connectTestDb, resetDb, testDatabaseUrl } from "../support/db";

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
