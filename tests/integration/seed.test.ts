import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeedContract } from "@tests/support/contracts/seed.contract";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, ensureBacklogPipeline, seedDemoBoard } from "@/infrastructure/seed/seed-demo-board";
import { sequentialIds } from "@tests/support/app-context";
import { memoryFiles } from "@tests/support/seed-files";
import { drizzleHarness } from "./support/harness";
import { connectTestDb, resetDb } from "./support/db";
import { drizzleDeps } from "./support/tx";

runSeedContract("Drizzle + Postgres", drizzleHarness);

describe("demo seed under real concurrency", () => {
  const handle = connectTestDb();
  beforeEach(() => resetDb(handle));
  afterAll(() => handle.close());

  it("concurrent seeds with files leave exactly the objects the winner's rows point at: the losers delete theirs", async () => {
    const deps = drizzleDeps(handle);
    const { files, objects, puts } = memoryFiles();
    const results = await Promise.all(
      ["1", "2", "3"].map((n) => seedDemoBoard({ ...deps, ids: sequentialIds(n) }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, files })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const launch = (await deps.repos.pipelines.listByBoard(DEMO_BOARD_ID, { limit: 10, offset: 0 })).find((p) => p.name === "Launch plan")!;
    const tasks = await deps.repos.tasks.listByPipeline(launch.id, { limit: 50, offset: 0 });
    const comments = (await Promise.all(tasks.map((t) => deps.repos.comments.listByTask(t.id, { limit: 50, offset: 0 })))).flat();
    const attachments = await deps.repos.attachments.listByComments(comments.map((c) => c.id));
    expect(attachments.length).toBeGreaterThan(0);
    expect(puts.length).toBeGreaterThanOrEqual(attachments.length);
    expect([...objects.keys()].sort()).toEqual(attachments.map((a) => a.storageKey).sort());
  });

  it("three simultaneous seeds create the board once and report who created it", async () => {
    const deps = drizzleDeps(handle);
    const results = await Promise.all(
      [1, 2, 3].map((n) => seedDemoBoard({ ...deps, ids: sequentialIds(String(n)) }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const pipelines = await deps.repos.pipelines.listByBoard(DEMO_BOARD_ID, { limit: 10, offset: 0 });
    expect(pipelines.map((p) => p.name)).toEqual(["Backlog", "Launch plan"]);
    for (const pipeline of pipelines) expect(await deps.repos.stages.listByPipeline(pipeline.id)).toHaveLength(3);
  });

  it("simultaneous ensure runs on a board without the Backlog add it exactly once", async () => {
    const deps = drizzleDeps(handle);
    await deps.uow.run(async (tx) => {
      await tx.boards.insert({ id: DEMO_BOARD_ID, name: "Product launch (demo)", description: "", status: "active", createdAt: new Date() });
      await tx.members.insert({ boardId: DEMO_BOARD_ID, userId: DEMO_OWNER_ID, role: "owner" });
    });
    const results = await Promise.all(
      [1, 2, 3].map((n) => ensureBacklogPipeline({ ...deps, ids: sequentialIds(String(n)) }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })),
    );
    expect(results.filter((r) => r.added)).toHaveLength(1);
    expect((await deps.repos.pipelines.listByBoard(DEMO_BOARD_ID, { limit: 10, offset: 0 })).map((p) => p.name)).toEqual(["Backlog"]);
  });
});
