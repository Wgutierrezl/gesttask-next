import { describe, expect, it, vi } from "vitest";
import { runScheduledMaintenance, type Maintenance } from "@/infrastructure/maintenance";

const fakes = (overrides: Partial<Maintenance> = {}) => {
  const calls: string[] = [];
  const job = <T>(name: string, result: T) => vi.fn(async () => (calls.push(name), result));
  const maintenance: Maintenance = {
    warmUp: job("warmUp", undefined),
    purgeExpiredGuests: job("purgeExpiredGuests", { users: 2, boards: 3 }),
    sweepPendingUploads: job("sweepPendingUploads", { swept: 4 }),
    drainStorageDeletions: job("drainStorageDeletions", { deleted: 7, failed: 0 }),
    purgeRateLimits: job("purgeRateLimits", { purged: 9 }),
    ...overrides,
  };
  return { maintenance, calls };
};
const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
let tick = 0;
const clock = { now: () => new Date(Date.UTC(2026, 9, 10, 4, 0, 0) + 250 * tick++) };

describe("runScheduledMaintenance", () => {
  it("wakes the database first, queues objects (guest purge, upload sweep) BEFORE draining so one run deletes them, and trims the limiter last", async () => {
    const { maintenance, calls } = fakes();
    await runScheduledMaintenance(maintenance, { logger: logger(), clock });
    expect(calls).toEqual(["warmUp", "purgeExpiredGuests", "sweepPendingUploads", "drainStorageDeletions", "purgeRateLimits"]);
  });

  it("reports every job's result and the duration", async () => {
    tick = 0;
    const { maintenance } = fakes();
    const report = await runScheduledMaintenance(maintenance, { logger: logger(), clock });
    expect(report).toMatchObject({
      ok: true,
      startedAt: "2026-10-10T04:00:00.000Z",
      durationMs: 250,
      jobs: {
        warmUp: { ok: true },
        purgeExpiredGuests: { ok: true, result: { users: 2, boards: 3 } },
        sweepPendingUploads: { ok: true, result: { swept: 4 } },
        drainStorageDeletions: { ok: true, result: { deleted: 7, failed: 0 } },
        purgeRateLimits: { ok: true, result: { purged: 9 } },
      },
    });
  });

  it("a failing job does not stop the others, is logged with its name, and makes the run not ok (without leaking the error to the report)", async () => {
    const { maintenance, calls } = fakes({ sweepPendingUploads: vi.fn(async () => { throw new Error("connection string postgres://u:p@h failed"); }) });
    const log = logger();
    const report = await runScheduledMaintenance(maintenance, { logger: log, clock });
    expect(report.ok).toBe(false);
    expect(report.jobs.sweepPendingUploads).toEqual({ ok: false });
    expect(JSON.stringify(report)).not.toMatch(/postgres|connection/);
    expect(report.jobs.drainStorageDeletions).toMatchObject({ ok: true });
    expect(calls).toEqual(["warmUp", "purgeExpiredGuests", "drainStorageDeletions", "purgeRateLimits"]);
    expect(log.error).toHaveBeenCalledWith("scheduled maintenance job failed", { job: "sweepPendingUploads", error: expect.any(Error) });
  });

  it("a failed warm-up (database asleep or down) is reported but the jobs still try", async () => {
    const { maintenance, calls } = fakes({ warmUp: vi.fn(async () => { throw new Error("down"); }) });
    const report = await runScheduledMaintenance(maintenance, { logger: logger(), clock });
    expect(report.ok).toBe(false);
    expect(report.jobs.warmUp).toEqual({ ok: false });
    expect(calls).toContain("purgeExpiredGuests");
  });
});
