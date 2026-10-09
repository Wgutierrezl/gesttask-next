import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import { makeAddMember } from "@/application/use-cases/members/add-member";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { actor } from "@tests/support/fixtures";
import { connectTestDb, resetDb } from "../support/db";
import { deferred, drizzleDeps, track, waitUntilBlocked } from "../support/tx";

const handle = connectTestDb(5_000);
const deps = drizzleDeps(handle);

beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

async function boardWithOwners(...owners: string[]): Promise<string> {
  const [first, ...rest] = owners as [string, ...string[]];
  const board = await makeCreateBoard(deps)(actor(first), { name: "Race" });
  for (const userId of rest) await deps.repos.members.insert({ boardId: board.id, userId, role: "owner" });
  return board.id;
}

describe("members under real concurrency", () => {
  it("two parallel addMember calls for the same user leave one row: one succeeds, one is a ConflictError", async () => {
    const boardId = await boardWithOwners("owner");
    const add = makeAddMember(deps);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => add(actor("owner"), { boardId, userId: "newbie", role: "member" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(3);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
    expect(await deps.repos.members.listByBoard(boardId, { limit: 10, offset: 0 })).toHaveLength(2);
  });

  it("countByRole locks the owner rows: a second transaction waits, then sees the committed demotion", async () => {
    const boardId = await boardWithOwners("o1", "o2");
    const locked = deferred();
    const release = deferred();
    const first = deps.uow.run(async (tx) => {
      const owners = await tx.members.countByRole(boardId, "owner");
      locked.resolve();
      await release.promise;
      await tx.members.updateRole(boardId, "o1", "member");
      return owners;
    });
    await locked.promise;

    const second = track(deps.uow.run((tx) => tx.members.countByRole(boardId, "owner")));
    await waitUntilBlocked(handle);
    expect(second.settled()).toBe(false);

    release.resolve();
    expect(await first).toBe(2);
    expect(await second.promise).toBe(1);
  });

  it("find locks the member row: a concurrent role change waits for the first transaction", async () => {
    const boardId = await boardWithOwners("o1");
    await deps.repos.members.insert({ boardId, userId: "m1", role: "member" });
    const locked = deferred();
    const release = deferred();
    const first = deps.uow.run(async (tx) => {
      await tx.members.find(boardId, "m1");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;

    const second = track(deps.uow.run((tx) => tx.members.updateRole(boardId, "m1", "guest")));
    await waitUntilBlocked(handle);
    expect(second.settled()).toBe(false);
    release.resolve();
    await first;
    await second.promise;
    expect((await deps.repos.members.find(boardId, "m1"))?.role).toBe("guest");
  });

  it("a plain (non-transactional) read never blocks behind a locked row", async () => {
    const boardId = await boardWithOwners("o1");
    const locked = deferred();
    const release = deferred();
    const holder = deps.uow.run(async (tx) => {
      await tx.members.countByRole(boardId, "owner");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    // Would fail by lock_timeout, not hang, if the plain read queued behind the holder's row locks.
    expect(await deps.repos.members.countByRole(boardId, "owner")).toBe(1);
    release.resolve();
    await holder;
  });
});
