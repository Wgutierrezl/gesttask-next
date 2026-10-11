import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeedContract } from "@tests/support/contracts/seed.contract";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, seedDemoBoard } from "@/infrastructure/seed/seed-demo-board";
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
    const tasks = await deps.repos.tasks.listByPipeline((await deps.repos.pipelines.listByBoard(DEMO_BOARD_ID, { limit: 10, offset: 0 }))[0]!.id, { limit: 50, offset: 0 });
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
    expect(pipelines).toHaveLength(1);
    expect(await deps.repos.stages.listByPipeline(pipelines[0]!.id)).toHaveLength(3);
  });
});
