import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "./support/db";

const SECRET = "integration-cron-secret-0123456789";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  const { testDatabaseUrl: url } = await import("./support/db");
  let container: ReturnType<typeof actual.buildContainer> | undefined;
  return {
    ...actual,
    getContainer: () =>
      (container ??= actual.buildContainer({
        DB_DRIVER: "pg",
        DATABASE_URL: url(),
        STORAGE_DRIVER: "local",
        BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
        CRON_SECRET: SECRET,
      })),
  };
});

const route = await import("@/app/api/cron/reset/route");
const handle = connectTestDb();
const get = (headers: Record<string, string> = {}) => route.GET(new Request("http://localhost:3000/api/cron/reset", { headers }));

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

describe("GET /api/cron/reset against Postgres (REQ-DEMO-02, REQ-SEC-04)", () => {
  it("refuses a caller without the secret and changes nothing", async () => {
    const old = new Date(Date.now() - 48 * 3_600_000);
    await handle.db.insert(schema.user).values({ id: "stale-guest", name: "g", email: "g@x.test", emailVerified: false, isAnonymous: true, createdAt: old, updatedAt: old });
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer wrong" })).status).toBe(401);
    expect(await handle.db.select().from(schema.user)).toHaveLength(1);
  });

  it("purges the expired guest and the old limiter windows, keeps the fresh ones, and reports each job", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 48 * 3_600_000);
    await handle.db.insert(schema.user).values([
      { id: "stale-guest", name: "g", email: "g@x.test", emailVerified: false, isAnonymous: true, createdAt: old, updatedAt: old },
      { id: "fresh-guest", name: "f", email: "f@x.test", emailVerified: false, isAnonymous: true, createdAt: now, updatedAt: now },
    ]);
    await handle.db.insert(schema.rateLimits).values([
      { key: "old", windowStart: old, count: 1 },
      { key: "new", windowStart: now, count: 1 },
    ]);
    const response = await get({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const report = await response.json();
    expect(report).toMatchObject({
      ok: true,
      jobs: {
        warmUp: { ok: true },
        purgeExpiredGuests: { ok: true, result: { users: 1, boards: 0 } },
        sweepPendingUploads: { ok: true, result: { swept: 0 } },
        drainStorageDeletions: { ok: true, result: { deleted: 0, failed: 0 } },
        purgeRateLimits: { ok: true, result: { purged: 1 } },
      },
    });
    expect((await handle.db.select().from(schema.user)).map((u) => u.id)).toEqual(["fresh-guest"]);
    expect((await handle.db.select().from(schema.rateLimits)).map((r) => r.key)).toEqual(["new"]);
  });
});
