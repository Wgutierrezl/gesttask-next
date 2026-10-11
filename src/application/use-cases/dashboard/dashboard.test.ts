import { beforeEach, describe, expect, it } from "vitest";
import { emptyCounts } from "@/domain/entities/dashboard";
import { NotFoundError, ValidationError } from "@/domain/errors";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, STRANGER, seedKanban } from "@tests/support/fixtures";
import { makeCreateTask } from "../tasks/create-task";
import { makeGetBoardDashboard } from "./get-board-dashboard";
import { makeGetUserDashboard } from "./get-user-dashboard";

describe("dashboards (REQ-DSH-01..03)", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  beforeEach(async () => {
    ctx = createTestContext(); // the clock reads 2026-10-09
    k = await seedKanban(ctx);
  });
  const create = (input: Record<string, unknown>) => makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "t", ...input });

  describe("getUserDashboard", () => {
    it("is all zeros with a successful answer for someone with no boards (REQ-DSH-02)", async () => {
      expect(await makeGetUserDashboard(ctx)(STRANGER)).toEqual({ boards: 0, assigned: emptyCounts() });
    });

    it("counts the caller's boards and what is assigned to them, overdue judged by the server clock", async () => {
      await create({ assigneeId: MEMBER.userId, priority: "high", dueDate: "2026-10-08" });
      await create({ assigneeId: MEMBER.userId, priority: "low", dueDate: "2026-10-09" });
      await create({ assigneeId: OWNER.userId });
      const dashboard = await makeGetUserDashboard(ctx)(MEMBER);
      expect(dashboard.boards).toBe(1);
      expect(dashboard.assigned).toMatchObject({ total: 2, byPriority: { low: 1, medium: 0, high: 1 }, overdue: 1 });
      ctx.clock.set(new Date("2026-10-10T00:00:00.000Z"));
      expect((await makeGetUserDashboard(ctx)(MEMBER)).assigned.overdue).toBe(2);
    });

    it("takes no input at all: it is always the caller's own (REQ-ISO-05)", async () => {
      await create({ assigneeId: MEMBER.userId });
      expect(makeGetUserDashboard(ctx).length).toBe(1); // (actor) only: no user id to aim at someone else
      expect((await makeGetUserDashboard(ctx)(OWNER)).assigned.total).toBe(0);
    });
  });

  describe("getBoardDashboard", () => {
    it("shows every stage with its counts, empty ones as zeros, to any member including the guest role", async () => {
      await create({ priority: "high" });
      for (const who of [OWNER, MEMBER, GUEST]) {
        const dashboard = await makeGetBoardDashboard(ctx)(who, { boardId: k.boardId });
        expect(dashboard.members).toBe(3);
        expect(dashboard.pipelines).toHaveLength(1);
        expect(dashboard.pipelines[0]!.stages.map((s) => [s.name, s.tasks.total])).toEqual([["To do", 1], ["In progress", 0], ["Done", 0]]);
        expect(dashboard.pipelines[0]!.stages[1]!.tasks).toEqual(emptyCounts());
        expect(dashboard.tasks).toMatchObject({ total: 1, byPriority: { high: 1 } });
      }
    });

    it("answers a stranger and a missing board the same NotFound (REQ-DSH-03, REQ-ISO-08)", async () => {
      const foreign = await makeGetBoardDashboard(ctx)(STRANGER, { boardId: k.boardId }).catch((e: unknown) => e);
      const missing = await makeGetBoardDashboard(ctx)(STRANGER, { boardId: "00000000-0000-4000-8000-0000000fff01" }).catch((e: unknown) => e);
      expect(foreign).toBeInstanceOf(NotFoundError);
      expect(missing).toEqual(foreign);
    });

    it("rejects a malformed id as validation, before touching data", async () => {
      await expect(makeGetBoardDashboard(ctx)(OWNER, { boardId: "nope" })).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
