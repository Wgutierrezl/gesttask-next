import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "cron-secret-0123456789abcdef";
const cron = vi.hoisted(() => ({ authorized: vi.fn(), run: vi.fn() }));
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ cron }) }));

const route = await import("@/app/api/cron/reset/route");
const call = (headers: Record<string, string> = {}, method = "GET") => route.GET(new Request("https://app.example.com/api/cron/reset", { method, headers }));

beforeEach(() => {
  vi.resetAllMocks();
  cron.authorized.mockImplementation((header: string | null) => header === `Bearer ${SECRET}`);
});

describe("/api/cron/reset", () => {
  it("answers 401 without running anything when the secret is missing or wrong (REQ-DEMO-02)", async () => {
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer nope" }, { authorization: SECRET }]) {
      const response = await call(headers);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(cron.run).not.toHaveBeenCalled();
  });

  it("runs the scheduled maintenance for the right secret and returns the report, uncacheable", async () => {
    cron.run.mockResolvedValue({ ok: true, jobs: { drainStorageDeletions: { ok: true, result: { deleted: 2, failed: 0 } } } });
    const response = await call({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, jobs: { drainStorageDeletions: { result: { deleted: 2 } } } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cron.run).toHaveBeenCalledOnce();
  });

  it("answers 500 with the report when a job failed, so the platform shows the run as failed", async () => {
    cron.run.mockResolvedValue({ ok: false, jobs: { purgeExpiredGuests: { ok: false } } });
    const response = await call({ authorization: `Bearer ${SECRET}` });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, jobs: { purgeExpiredGuests: { ok: false } } });
  });

  it("only exposes GET (what Vercel Cron sends)", () => {
    expect(Object.keys(route).filter((name) => /^[A-Z]+$/.test(name))).toEqual(["GET"]);
  });
});
