import type { Task } from "@/domain/entities/task";
import type { Actor } from "@/application/actor";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import type { TestContext } from "./app-context";

export const actor = (userId: string): Actor => ({ userId, isGuest: false });
export const OWNER = actor("owner");
export const MEMBER = actor("member");
export const GUEST = actor("guest");
export const STRANGER = actor("stranger");

/** A board owned by OWNER with one member and one guest; STRANGER has no membership. */
export async function seedBoard(ctx: TestContext): Promise<{ boardId: string }> {
  const board = await makeCreateBoard(ctx)(OWNER, { name: "Board" });
  await ctx.repos.members.insert({ boardId: board.id, userId: MEMBER.userId, role: "member" });
  await ctx.repos.members.insert({ boardId: board.id, userId: GUEST.userId, role: "guest" });
  return { boardId: board.id };
}

export function buildTask(overrides: Partial<Task> & Pick<Task, "id" | "stageId" | "pipelineId" | "boardId">): Task {
  return {
    title: overrides.id,
    description: "",
    priority: "medium",
    status: "active",
    dueDate: null,
    assigneeId: null,
    completedAt: null,
    position: "V",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}
