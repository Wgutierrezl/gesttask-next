import type { Task } from "@/domain/entities/task";
import type { Actor } from "@/application/actor";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { makeCreatePipeline } from "@/application/use-cases/pipelines/create-pipeline";
import type { TestContext } from "./app-context";

export const actor = (userId: string): Actor => ({ userId, isGuest: false });
export const OWNER = actor("owner");
export const MEMBER = actor("member");
export const GUEST = actor("guest");
export const STRANGER = actor("stranger");
/** Owner of a second board; has no membership in the primary board. */
export const RIVAL = actor("rival");
/** Plain member of the second board. */
export const RIVAL_MEMBER = actor("rival-member");

/** A board owned by `owner` (default OWNER) with one member and one guest; STRANGER has no membership. */
export async function seedBoard(ctx: TestContext, owner: Actor = OWNER): Promise<{ boardId: string }> {
  const board = await makeCreateBoard(ctx)(owner, { name: "Board" });
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
    position: "a0",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** A seeded board with one pipeline holding the default stages (To do, In progress, Done); Done is flagged. */
export async function seedKanban(ctx: TestContext, owner: Actor = OWNER) {
  const { boardId } = await seedBoard(ctx, owner);
  const pipeline = await makeCreatePipeline(ctx)(owner, { boardId, name: "P" });
  const stages = await ctx.repos.stages.listByPipeline(pipeline.id);
  const byName = (name: string) => stages.find((s) => s.name === name)!.id;
  return {
    boardId,
    pipelineId: pipeline.id,
    todoId: byName("To do"),
    progressId: byName("In progress"),
    doneId: byName("Done"),
  };
}

/** Removes the default stages so a test can build its own layout from an empty pipeline. */
export function clearStages(ctx: TestContext, pipelineId: string): void {
  for (const [id, stage] of ctx.store.stages) if (stage.pipelineId === pipelineId) ctx.store.stages.delete(id);
}
