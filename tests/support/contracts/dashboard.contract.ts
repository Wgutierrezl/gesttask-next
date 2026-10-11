import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { emptyCounts } from "@/domain/entities/dashboard";
import { makeBoard, makePipeline, makeStage, makeTask, seedPipeline, uuid, type RepoHarness } from "./harness";

const TODAY = "2026-10-09";

/** Behaviour every DashboardRepo must share: the fakes and Postgres run the same suite. */
export function runDashboardContract(name: string, setup: () => RepoHarness): void {
  describe(`dashboard repository (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    const join = async (boardId: string, userId: string, role: "owner" | "member" | "guest" = "member") => h.repos.members.insert({ boardId, userId, role });

    describe("per user", () => {
      it("is all zeros for a user with no boards and no tasks (REQ-DSH-02)", async () => {
        expect(await h.repos.dashboard.forUser("nobody", TODAY)).toEqual({ boards: 0, assigned: emptyCounts() });
      });

      it("counts the boards the user is on, even those with no tasks", async () => {
        const [a, b] = [makeBoard(), makeBoard()];
        for (const board of [a, b]) await h.repos.boards.insert(board);
        await join(a.id, "u1", "owner");
        await join(b.id, "u1", "guest");
        await join(b.id, "u2");
        expect(await h.repos.dashboard.forUser("u1", TODAY)).toEqual({ boards: 2, assigned: emptyCounts() });
      });

      it("counts only the tasks assigned to the user, split by priority, status and overdue", async () => {
        const { board, pipeline } = await seedPipeline(h);
        const stage = makeStage(pipeline);
        await h.repos.stages.insert(stage);
        await join(board.id, "u1", "owner");
        await join(board.id, "u2");
        const task = (extra: Parameters<typeof makeTask>[1]) => h.repos.tasks.insert(makeTask(stage, extra));
        await task({ assigneeId: "u1", priority: "high", dueDate: "2026-10-08" }); // overdue
        await task({ assigneeId: "u1", priority: "high", dueDate: TODAY }); // due today is not overdue yet
        await task({ assigneeId: "u1", priority: "low", status: "inactive", dueDate: "2026-01-01", completedAt: new Date("2026-02-01T00:00:00Z") }); // done: never overdue
        await task({ assigneeId: "u1", priority: "medium" });
        await task({ assigneeId: "u2", priority: "high", dueDate: "2020-01-01" }); // someone else's
        await task({ assigneeId: null, priority: "high" });
        expect((await h.repos.dashboard.forUser("u1", TODAY)).assigned).toEqual({
          total: 4,
          byPriority: { low: 1, medium: 1, high: 2 },
          byStatus: { active: 3, inactive: 1 },
          overdue: 1,
        });
      });

      it("ignores tasks on boards the user is not on, whoever they are assigned to", async () => {
        const mine = await seedPipeline(h);
        const theirs = await seedPipeline(h);
        const [s1, s2] = [makeStage(mine.pipeline), makeStage(theirs.pipeline)];
        await h.repos.stages.insert(s1);
        await h.repos.stages.insert(s2);
        await join(mine.board.id, "u1");
        await h.repos.tasks.insert(makeTask(s1, { assigneeId: "u1" }));
        await h.repos.tasks.insert(makeTask(s2, { assigneeId: "u1" })); // stale assignment on a board u1 left
        const dashboard = await h.repos.dashboard.forUser("u1", TODAY);
        expect(dashboard.boards).toBe(1);
        expect(dashboard.assigned.total).toBe(1);
      });
    });

    describe("per board", () => {
      it("is null for a board that does not exist", async () => {
        expect(await h.repos.dashboard.forBoard(uuid(), TODAY)).toBeNull();
      });

      it("a board with no pipelines still reports its members", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        await join(board.id, "u1", "owner");
        await join(board.id, "u2");
        expect(await h.repos.dashboard.forBoard(board.id, TODAY)).toEqual({ boardId: board.id, members: 2, pipelines: [], tasks: emptyCounts() });
      });

      it("lists every stage, with zeros for the empty ones, and a pipeline that has no stage yet", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        const [beta, alpha, bare] = [makePipeline(board.id, { name: "Beta" }), makePipeline(board.id, { name: "Alpha" }), makePipeline(board.id, { name: "Zeta" })];
        for (const p of [beta, alpha, bare]) await h.repos.pipelines.insert(p);
        const todo = makeStage(alpha, { name: "To do", position: "a0" });
        const done = makeStage(alpha, { name: "Done", position: "a1", isDone: true });
        const other = makeStage(beta, { name: "Only", position: "a0" });
        for (const s of [done, todo, other]) await h.repos.stages.insert(s);
        await h.repos.tasks.insert(makeTask(todo, { priority: "high", dueDate: "2026-10-01" }));
        await h.repos.tasks.insert(makeTask(todo, { priority: "low", status: "inactive" }));
        await h.repos.tasks.insert(makeTask(other, { priority: "medium" }));
        await join(board.id, "u1", "owner");

        const dashboard = (await h.repos.dashboard.forBoard(board.id, TODAY))!;
        expect(dashboard.members).toBe(1);
        expect(dashboard.pipelines.map((p) => [p.name, p.stages.map((s) => s.name)])).toEqual([["Alpha", ["To do", "Done"]], ["Beta", ["Only"]], ["Zeta", []]]);
        const alphaStages = dashboard.pipelines[0]!.stages;
        expect(alphaStages[0]).toEqual({ id: todo.id, name: "To do", isDone: false, tasks: { total: 2, byPriority: { low: 1, medium: 0, high: 1 }, byStatus: { active: 1, inactive: 1 }, overdue: 1 } });
        expect(alphaStages[1]).toEqual({ id: done.id, name: "Done", isDone: true, tasks: emptyCounts() });
        expect(dashboard.tasks).toEqual({ total: 3, byPriority: { low: 1, medium: 1, high: 1 }, byStatus: { active: 2, inactive: 1 }, overdue: 1 });
      });

      it("counts nothing from another board", async () => {
        const mine = await seedPipeline(h);
        const theirs = await seedPipeline(h);
        const [s1, s2] = [makeStage(mine.pipeline), makeStage(theirs.pipeline)];
        await h.repos.stages.insert(s1);
        await h.repos.stages.insert(s2);
        await h.repos.tasks.insert(makeTask(s2));
        await join(theirs.board.id, "u9");
        const dashboard = (await h.repos.dashboard.forBoard(mine.board.id, TODAY))!;
        expect(dashboard.members).toBe(0);
        expect(dashboard.tasks.total).toBe(0);
        expect(dashboard.pipelines[0]!.stages).toHaveLength(1);
      });
    });
  });
}
