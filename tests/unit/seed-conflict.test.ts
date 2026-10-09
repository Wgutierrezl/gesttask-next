import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, seedDemoBoard } from "@/infrastructure/seed/seed-demo-board";
import { sequentialIds } from "@tests/support/app-context";

const NOW = new Date("2026-10-09T12:00:00.000Z");

/** First `run` fails with a conflict (a concurrent seed won); the second is the re-check. */
function racedUow(boardExistsAfterwards: boolean): UnitOfWork {
  const board = { id: DEMO_BOARD_ID };
  const run = vi
    .fn()
    .mockRejectedValueOnce(new ConflictError("duplicate key"))
    .mockImplementationOnce((work: (repos: Repos) => unknown) =>
      work({ boards: { findById: async () => (boardExistsAfterwards ? board : null) } } as unknown as Repos),
    );
  return { run } as unknown as UnitOfWork;
}

const options = { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID };

describe("seedDemoBoard conflict handling", () => {
  it("reports created: false when the conflict came from a concurrent seed that created the board", async () => {
    const uow = racedUow(true);
    const result = await seedDemoBoard({ uow, ids: sequentialIds("9"), clock: { now: () => NOW } }, options);
    expect(result).toEqual({ created: false, boardId: DEMO_BOARD_ID });
  });

  it("rethrows the conflict when the board does not exist (it was some other unique violation)", async () => {
    const uow = racedUow(false);
    await expect(seedDemoBoard({ uow, ids: sequentialIds("9"), clock: { now: () => NOW } }, options)).rejects.toBeInstanceOf(ConflictError);
  });
});
