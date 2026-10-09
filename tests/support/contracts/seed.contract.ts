import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_BOARD_ID, DEMO_OWNER_ID, DEMO_VIEWER_ID, seedDemoBoard, type SeedDeps,
} from "@/infrastructure/seed/seed-demo-board";
import { isOverdue } from "@/domain/entities/task";
import { sequentialIds } from "@tests/support/app-context";
import { uuid, type RepoHarness } from "./harness";

const NOW = new Date("2026-10-09T12:00:00.000Z");

/** The demo seed must behave identically on the fakes and on Postgres. */
export function runSeedContract(name: string, setup: () => RepoHarness): void {
  describe(`demo seed (${name})`, () => {
    const h = setup();
    const deps = (): SeedDeps => ({ uow: h.uow, ids: sequentialIds("5"), clock: { now: () => NOW } });
    beforeEach(() => h.reset());

    const snapshot = async (boardId: string) => {
      const pipelines = await h.repos.pipelines.listByBoard(boardId, { limit: 50, offset: 0 });
      const stages = await h.repos.stages.listByPipeline(pipelines[0]!.id);
      const tasks = await h.repos.tasks.listByPipeline(pipelines[0]!.id, { limit: 200, offset: 0 });
      const members = await h.repos.members.listByBoard(boardId, { limit: 50, offset: 0 });
      return { pipelines, stages, tasks, members };
    };

    it("creates a demo board with an owner, a read-only viewer and a realistic kanban", async () => {
      expect(await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })).toEqual({
        created: true, boardId: DEMO_BOARD_ID,
      });
      const { pipelines, stages, tasks, members } = await snapshot(DEMO_BOARD_ID);
      expect(pipelines).toHaveLength(1);
      expect(stages.map((s) => s.name)).toEqual(["To do", "In progress", "Done"]);
      expect(stages.filter((s) => s.isDone).map((s) => s.name)).toEqual(["Done"]);
      expect(members.map((m) => [m.userId, m.role])).toEqual([[DEMO_OWNER_ID, "owner"], [DEMO_VIEWER_ID, "guest"]]);
      expect(tasks.length).toBeGreaterThanOrEqual(6);
      const doneId = stages.find((s) => s.isDone)!.id;
      for (const task of tasks) expect(task.completedAt !== null).toBe(task.stageId === doneId);
      expect(tasks.some((t) => isOverdue(t, NOW))).toBe(true);
      expect(tasks.some((t) => t.assigneeId === DEMO_OWNER_ID)).toBe(true);
      for (const stage of stages) {
        const positions = tasks.filter((t) => t.stageId === stage.id).map((t) => t.position);
        expect(new Set(positions).size).toBe(positions.length);
      }
    });

    it("is idempotent: a second run changes nothing", async () => {
      await seedDemoBoard(deps(), { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID });
      const before = await snapshot(DEMO_BOARD_ID);
      expect(await seedDemoBoard({ ...deps(), ids: sequentialIds("6") }, { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID })).toEqual({
        created: false, boardId: DEMO_BOARD_ID,
      });
      expect(await snapshot(DEMO_BOARD_ID)).toEqual(before);
    });

    it("clones independent boards for other owners", async () => {
      const [a, b] = [uuid(), uuid()];
      await seedDemoBoard(deps(), { ownerId: "guest-1", boardId: a });
      await seedDemoBoard({ ...deps(), ids: sequentialIds("7") }, { ownerId: "guest-2", boardId: b });
      expect((await snapshot(a)).members.map((m) => m.userId)).toContain("guest-1");
      expect((await snapshot(b)).members.map((m) => m.userId)).toContain("guest-2");
      expect((await h.repos.boards.listByMember("guest-1", { limit: 9, offset: 0 })).map((x) => x.id)).toEqual([a]);
      expect((await snapshot(a)).tasks.length).toBe((await snapshot(b)).tasks.length);
    });
  });
}
