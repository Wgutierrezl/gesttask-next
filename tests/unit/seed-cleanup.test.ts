import { describe, expect, it, vi } from "vitest";
import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, seedDemoBoard, type SeedFiles } from "@/infrastructure/seed/seed-demo-board";
import { sequentialIds } from "@tests/support/app-context";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const clock = { now: () => NOW };

/** The pre-check sees no board; then the transaction does `inTransaction`. */
function uowWith(inTransaction: (work: (repos: Repos) => unknown) => unknown): UnitOfWork {
  const run = vi
    .fn()
    .mockImplementationOnce((work: (repos: Repos) => unknown) => work({ boards: { findById: async () => null } } as unknown as Repos))
    .mockImplementationOnce(inTransaction);
  return { run } as unknown as UnitOfWork;
}

function storeWith(deleteImpl: SeedFiles["delete"]) {
  return { put: vi.fn().mockResolvedValue(undefined), delete: vi.fn(deleteImpl) } satisfies SeedFiles;
}

describe("seedDemoBoard cleanup of stored objects", () => {
  it("keeps the ORIGINAL error when the transaction fails and the cleanup fails too, and says which objects may be orphaned", async () => {
    const files = storeWith(async () => {
      throw new Error("storage down");
    });
    const log = vi.fn();
    const original = new Error("database exploded");
    const uow = uowWith(async () => {
      throw original;
    });
    await expect(
      seedDemoBoard({ uow, ids: sequentialIds("9"), clock }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files, log }),
    ).rejects.toBe(original);
    expect(files.delete).toHaveBeenCalledTimes(1);
    const keys = files.delete.mock.calls[0]![0];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/orphan/i);
    expect(log.mock.calls[0]![1]).toMatchObject({ keys, error: expect.objectContaining({ message: "storage down" }) });
  });

  it("does not log when the cleanup works, and still throws the original error", async () => {
    const files = storeWith(async () => undefined);
    const log = vi.fn();
    const original = new Error("database exploded");
    const uow = uowWith(async () => {
      throw original;
    });
    await expect(
      seedDemoBoard({ uow, ids: sequentialIds("9"), clock }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files, log }),
    ).rejects.toBe(original);
    expect(files.delete).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("a failing cleanup after losing the race does not turn a successful no-op into an error", async () => {
    const files = storeWith(async () => {
      throw new Error("storage down");
    });
    const log = vi.fn();
    // The transaction finds the board (a concurrent run created it): created false, and the objects stored for nothing are deleted.
    const uow = uowWith((work) => work({ boards: { findById: async () => ({ id: DEMO_BOARD_ID }) } } as unknown as Repos));
    const result = await seedDemoBoard(
      { uow, ids: sequentialIds("9"), clock },
      { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files, log },
    );
    expect(result).toEqual({ created: false, boardId: DEMO_BOARD_ID });
    expect(files.delete).toHaveBeenCalledTimes(1); // not retried by the catch block
    expect(log).toHaveBeenCalledTimes(1);
  });
});
