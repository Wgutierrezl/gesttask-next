import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";
import { makeStage, makeTask } from "@tests/support/contracts/harness";
import { connectTestDb, resetDb } from "../support/db";
import { addTask, seedKanban } from "../support/seed";
import { deferred, drizzleDeps, track, waitUntilBlocked } from "../support/tx";

const handle = connectTestDb(5_000);
const deps = drizzleDeps(handle);
// One attempt only: a deadlock must fail the test instead of being absorbed by the UoW retry.
const strictUow = new DrizzleUnitOfWork(handle.db, { maxAttempts: 1 });

// A failing assertion must not leave a transaction holding locks (the next TRUNCATE would hang).
const pendingReleases: Array<() => void> = [];
afterEach(() => pendingReleases.splice(0).forEach((release) => release()));
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

/** Runs `hold` in a transaction that signals once it holds its locks and keeps them until released. */
function holdingTransaction<T>(hold: (tx: Parameters<Parameters<typeof deps.uow.run>[0]>[0]) => Promise<T>) {
  const locked = deferred();
  const release = deferred();
  const done = deps.uow.run(async (tx) => {
    const result = await hold(tx);
    locked.resolve();
    await release.promise;
    return result;
  });
  pendingReleases.push(release.resolve);
  return { locked: locked.promise, release: release.resolve, done };
}

describe("lock-then-read lists return rows committed while they waited", () => {
  it("stages.listByPipeline waits for a concurrent update, then sees the new name", async () => {
    const { pipelineId, doing } = await seedKanban(deps);
    const writer = holdingTransaction(async (tx) => {
      const stage = (await tx.stages.findById(doing.id))!;
      await tx.stages.update({ ...stage, name: "Renamed" });
    });
    await writer.locked;

    const reader = track(deps.uow.run((tx) => tx.stages.listByPipeline(pipelineId)));
    await waitUntilBlocked(handle);
    expect(reader.settled()).toBe(false);

    writer.release();
    await writer.done;
    const stages = await reader.promise;
    expect(stages.map((s) => s.name)).toContain("Renamed");
    expect(stages.map((s) => s.name)).not.toContain("In progress");
  });

  it("tasks.listByStage waits for a concurrent update, then sees the new title and position", async () => {
    const { todo } = await seedKanban(deps);
    const task = await addTask(deps, todo.id, { title: "before" });
    const writer = holdingTransaction(async (tx) => {
      const current = (await tx.tasks.findById(task.id))!;
      await tx.tasks.update({ ...current, title: "after", position: "z" });
    });
    await writer.locked;

    const reader = track(deps.uow.run((tx) => tx.tasks.listByStage(todo.id)));
    await waitUntilBlocked(handle);
    expect(reader.settled()).toBe(false);

    writer.release();
    await writer.done;
    expect((await reader.promise).map((t) => [t.title, t.position])).toEqual([["after", "z"]]);
  });
});

describe("lock-then-read lists also serialize inserts into the parent", () => {
  it("a stage insert waits for a transaction that listed the pipeline's stages", async () => {
    const { pipelineId, boardId } = await seedKanban(deps);
    const lister = holdingTransaction((tx) => tx.stages.listByPipeline(pipelineId));
    await lister.locked;

    const insert = track(
      deps.uow.run((tx) => tx.stages.insert(makeStage({ id: pipelineId, boardId, name: "p", description: "" }, { name: "Late", position: "zz" }))),
    );
    await waitUntilBlocked(handle);
    expect(insert.settled()).toBe(false);

    lister.release();
    const seen = await lister.done;
    await insert.promise;
    expect(seen.map((s) => s.name)).not.toContain("Late"); // the listing is complete as of its lock
    expect((await deps.repos.stages.listByPipeline(pipelineId)).map((s) => s.name)).toContain("Late");
  });

  it("a task insert and a task move into the stage wait for a transaction that listed the stage's tasks", async () => {
    const { todo, doing } = await seedKanban(deps);
    const mover = await addTask(deps, doing.id);
    const lister = holdingTransaction((tx) => tx.tasks.listByStage(todo.id));
    await lister.locked;

    const insert = track(deps.uow.run((tx) => tx.tasks.insert(makeTask(todo, { title: "late", position: "zz" }))));
    const move = track(
      deps.uow.run(async (tx) => {
        const current = (await tx.tasks.findById(mover.id))!;
        await tx.tasks.update({ ...current, stageId: todo.id, position: "zy" });
      }),
    );
    await waitUntilBlocked(handle, 2);
    expect([insert.settled(), move.settled()]).toEqual([false, false]);

    lister.release();
    expect(await lister.done).toEqual([]);
    await Promise.all([insert.promise, move.promise]);
    expect(await deps.repos.tasks.listByStage(todo.id)).toHaveLength(2);
  });
});

describe("clearAssignee locks task rows in primary-key order", () => {
  it("does not deadlock with a transaction locking the same tasks in id order", async () => {
    const { boardId, todo } = await seedKanban(deps);
    // Insert in DESCENDING id order, so a plain UPDATE (physical order) would lock the tasks in the
    // opposite order to the global one.
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
    for (const id of ids) await deps.repos.tasks.insert(makeTask(todo, { id, assigneeId: "worker" }));
    const [low, , high] = [...ids].reverse() as [string, string, string];

    const lockedLow = deferred();
    const releaseHigh = deferred();
    pendingReleases.push(releaseHigh.resolve);
    const other = strictUow.run(async (tx) => {
      await tx.tasks.findById(low); // holds the lowest id
      lockedLow.resolve();
      await releaseHigh.promise;
      await tx.tasks.findById(high); // then wants the highest id
    });
    await lockedLow.promise;

    const clearing = track(strictUow.run((tx) => tx.tasks.clearAssignee(boardId, "worker")));
    await waitUntilBlocked(handle);
    releaseHigh.resolve();
    // Old behaviour: clearAssignee already holds `high` while waiting for `low` -> deadlock for one of them.
    await other;
    await clearing.promise;
    const tasks = await deps.repos.tasks.listByStage(todo.id);
    expect(tasks.every((t) => t.assigneeId === null)).toBe(true);
  });
});
