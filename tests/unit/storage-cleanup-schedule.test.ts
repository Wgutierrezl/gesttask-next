import { beforeEach, describe, expect, it, vi } from "vitest";

let scheduled: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => void scheduled.push(work) }));
const drainStorageDeletions = vi.fn();
const logger = { error: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ maintenance: { drainStorageDeletions }, logger }) }));

const { scheduleStorageCleanup } = await import("@/app/_shared/storage-cleanup");

beforeEach(() => {
  vi.clearAllMocks();
  scheduled = [];
});

describe("scheduleStorageCleanup", () => {
  it("defers the drain until after the response instead of delaying it", async () => {
    scheduleStorageCleanup();
    expect(drainStorageDeletions).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    drainStorageDeletions.mockResolvedValue({ deleted: 1, failed: 0 });
    await scheduled[0]!();
    expect(drainStorageDeletions).toHaveBeenCalledOnce();
  });

  it("logs a failed drain and never throws: the rows stay queued for the cron", async () => {
    scheduleStorageCleanup();
    drainStorageDeletions.mockRejectedValue(new Error("db down"));
    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("storage cleanup failed", { error: expect.any(Error) });
  });
});
