import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBoard, makePipeline, makeStage, makeTask } from "@tests/support/contracts/harness";
import { drizzleHarness } from "../support/harness";

/** REQ-NFR-07: a dashboard costs one statement, however big the board is. */
describe("dashboard queries (no N+1)", () => {
  const h = drizzleHarness();
  beforeEach(() => h.reset());
  afterAll(() => h.close?.());

  async function populate(pipelineCount: number) {
    const board = makeBoard();
    await h.repos.boards.insert(board);
    await h.repos.members.insert({ boardId: board.id, userId: "u1", role: "owner" });
    for (let p = 0; p < pipelineCount; p++) {
      const pipeline = makePipeline(board.id, { name: `P${p}` });
      await h.repos.pipelines.insert(pipeline);
      for (let s = 0; s < 4; s++) {
        const stage = makeStage(pipeline, { name: `S${s}`, position: `a${s}` });
        await h.repos.stages.insert(stage);
        for (let t = 0; t < 3; t++) await h.repos.tasks.insert(makeTask(stage, { assigneeId: "u1", position: `a${t}` }));
      }
    }
    return board;
  }

  /** Statements that reached a connection while `work` ran (every pool query ends in `Client.query`). */
  async function statementsOf(work: () => Promise<unknown>): Promise<string[]> {
    const spy = vi.spyOn(pg.Client.prototype, "query");
    try {
      await work();
      return spy.mock.calls.map(([query]) => (typeof query === "string" ? query : (query as { text: string }).text));
    } finally {
      spy.mockRestore();
    }
  }

  it("the board dashboard is one statement for one pipeline and for many", async () => {
    const small = await populate(1);
    const one = await statementsOf(() => h.repos.dashboard.forBoard(small.id, "2026-10-09"));
    await h.reset();
    const big = await populate(6);
    const many = await statementsOf(() => h.repos.dashboard.forBoard(big.id, "2026-10-09"));
    expect(one).toHaveLength(1);
    expect(many).toHaveLength(1);
    expect(many[0]).toMatch(/group by/i);
    const dashboard = (await h.repos.dashboard.forBoard(big.id, "2026-10-09"))!;
    expect(dashboard.pipelines).toHaveLength(6);
    expect(dashboard.tasks.total).toBe(6 * 4 * 3);
  });

  it("the user dashboard is one statement whatever the number of boards and tasks", async () => {
    await populate(3);
    await populate(3);
    const statements = await statementsOf(() => h.repos.dashboard.forUser("u1", "2026-10-09"));
    expect(statements).toHaveLength(1);
    expect((await h.repos.dashboard.forUser("u1", "2026-10-09")).assigned.total).toBe(2 * 3 * 4 * 3);
  });
});
