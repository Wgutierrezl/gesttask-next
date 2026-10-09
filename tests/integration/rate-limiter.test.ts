import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PgRateLimiter } from "@/infrastructure/ratelimit/pg-rate-limiter";
import { connectTestDb, resetDb } from "./support/db";

const handle = connectTestDb();
let now = new Date("2026-10-09T12:00:10.000Z");
const limiter = new PgRateLimiter(handle.db, { now: () => now });
const RULE = { limit: 3, windowSeconds: 60 };

beforeEach(async () => {
  await resetDb(handle);
  now = new Date("2026-10-09T12:00:10.000Z");
});
afterAll(() => handle.close());

describe("PgRateLimiter (fixed window)", () => {
  it("allows up to the limit, then blocks with the seconds left in the window", async () => {
    const decisions = [];
    for (let i = 0; i < 5; i++) decisions.push(await limiter.hit("login:1.2.3.4", RULE));
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false, false]);
    // The window started at 12:00:00 and ends at 12:01:00; it is 12:00:10 now.
    expect(decisions[3]!.retryAfterSeconds).toBe(50);
    expect(decisions[0]!.retryAfterSeconds).toBe(0);
  });

  it("rounds the wait up and never reports less than one second while blocked", async () => {
    for (let i = 0; i < 3; i++) await limiter.hit("k", RULE);
    now = new Date("2026-10-09T12:00:59.400Z");
    expect((await limiter.hit("k", RULE)).retryAfterSeconds).toBe(1);
  });

  it("starts a fresh window when the previous one ends", async () => {
    for (let i = 0; i < 4; i++) await limiter.hit("k", RULE);
    now = new Date("2026-10-09T12:01:00.000Z");
    expect(await limiter.hit("k", RULE)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("counts every key independently", async () => {
    for (let i = 0; i < 4; i++) await limiter.hit("a", RULE);
    expect((await limiter.hit("b", RULE)).allowed).toBe(true);
  });

  it("is atomic: 20 parallel hits against a limit of 5 allow exactly 5", async () => {
    const decisions = await Promise.all(Array.from({ length: 20 }, () => limiter.hit("burst", { limit: 5, windowSeconds: 3600 })));
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5);
  });

  it("purges windows that started before a cutoff", async () => {
    await limiter.hit("old", RULE);
    now = new Date("2026-10-09T13:00:00.000Z");
    await limiter.hit("fresh", RULE);
    expect(await limiter.purgeStartedBefore(new Date("2026-10-09T12:30:00.000Z"))).toBe(1);
    const { rows } = await handle.db.execute<{ key: string }>(sql`SELECT key FROM rate_limits`);
    expect(rows.map((r) => r.key)).toEqual(["fresh"]);
  });
});
