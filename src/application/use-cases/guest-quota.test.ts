import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { Actor } from "@/application/actor";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { OWNER, buildTask, seedKanban } from "@tests/support/fixtures";
import { GUEST_MAX_BOARDS, GUEST_MAX_TASKS } from "../guest-quota";

const guest: Actor = { userId: "visitor", isGuest: true };

describe("guest quotas (REQ-SEC-04)", () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it("limits a guest to 3 boards and answers the 4th with a conflict that creates nothing", async () => {
    expect(GUEST_MAX_BOARDS).toBe(3);
    for (let i = 0; i < GUEST_MAX_BOARDS; i++) await makeCreateBoard(ctx)(guest, { name: `b${i}` });
    await expect(makeCreateBoard(ctx)(guest, { name: "one too many" })).rejects.toBeInstanceOf(ConflictError);
    expect(await ctx.repos.members.listByUser(guest.userId)).toHaveLength(GUEST_MAX_BOARDS);
  });

  it("does not count boards the guest merely belongs to, and never limits real users", async () => {
    for (let i = 0; i < 5; i++) await makeCreateBoard(ctx)(OWNER, { name: `real${i}` });
    const { boardId } = await seedKanban(ctx);
    for (let i = 0; i < GUEST_MAX_BOARDS; i++) await ctx.repos.members.insert({ boardId: (await makeCreateBoard(ctx)(OWNER, { name: `x${i}` })).id, userId: guest.userId, role: "member" });
    await ctx.repos.members.insert({ boardId, userId: guest.userId, role: "member" });
    await expect(makeCreateBoard(ctx)(guest, { name: "mine" })).resolves.toBeDefined();
  });

  it("limits a guest to 200 tasks across the boards they belong to", async () => {
    expect(GUEST_MAX_TASKS).toBe(200);
    const k = await seedKanban(ctx, guest);
    const stage = (await ctx.repos.stages.findById(k.todoId))!;
    for (let i = 0; i < GUEST_MAX_TASKS - 1; i++) {
      await ctx.repos.tasks.insert(buildTask({ id: ctx.ids.next(), stageId: stage.id, pipelineId: stage.pipelineId, boardId: stage.boardId, position: `a${i.toString().padStart(4, "0")}` }));
    }
    await expect(makeCreateTask(ctx)(guest, { stageId: stage.id, title: "the 200th" })).resolves.toBeDefined();
    await expect(makeCreateTask(ctx)(guest, { stageId: stage.id, title: "the 201st" })).rejects.toBeInstanceOf(ConflictError);
    expect(await ctx.repos.tasks.countByBoards([stage.boardId])).toBe(GUEST_MAX_TASKS);
  });

  it("counts tasks on boards the guest merely belongs to, and never limits real users", async () => {
    const k = await seedKanban(ctx);
    const stage = (await ctx.repos.stages.findById(k.todoId))!;
    await ctx.repos.members.insert({ boardId: k.boardId, userId: guest.userId, role: "member" });
    for (let i = 0; i < GUEST_MAX_TASKS + 5; i++) {
      await ctx.repos.tasks.insert(buildTask({ id: ctx.ids.next(), stageId: stage.id, pipelineId: stage.pipelineId, boardId: stage.boardId, position: `a${i.toString().padStart(4, "0")}` }));
    }
    await expect(makeCreateTask(ctx)(OWNER, { stageId: stage.id, title: "owner is unlimited" })).resolves.toBeDefined();
    // As a member the guest can write here (task:write), but the board is already over their quota.
    await expect(makeCreateTask(ctx)(guest, { stageId: stage.id, title: "no loophole" })).rejects.toBeInstanceOf(ConflictError);
  });
});
