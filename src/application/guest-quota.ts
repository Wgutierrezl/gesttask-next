import { ConflictError } from "@/domain/errors";
import type { Actor } from "./actor";
import type { MemberRepo, TaskRepo } from "./ports/repositories";

/** Abuse limits for anonymous users (REQ-SEC-04); real accounts are unrestricted. */
export const GUEST_MAX_BOARDS = 3;
export const GUEST_MAX_TASKS = 200;

async function boardIdsOf(members: MemberRepo, actor: Actor, only?: "owner"): Promise<string[]> {
  return (await members.listByUser(actor.userId)).filter((m) => only === undefined || m.role === only).map((m) => m.boardId);
}

/**
 * Both checks run inside the creating transaction and first take the user's quota lock, so concurrent
 * creations by one guest queue up and each sees the committed count of the one before it.
 */
export async function assertGuestBoardQuota(members: MemberRepo, actor: Actor): Promise<void> {
  if (!actor.isGuest) return;
  await members.lockUserQuota(actor.userId);
  if ((await boardIdsOf(members, actor, "owner")).length >= GUEST_MAX_BOARDS) {
    throw new ConflictError(`Guest limit reached: at most ${GUEST_MAX_BOARDS} boards. Sign up to create more.`);
  }
}

/** Counts the tasks of every board the guest belongs to, so being a mere member of a big board is no loophole. */
export async function assertGuestTaskQuota(repos: { members: MemberRepo; tasks: TaskRepo }, actor: Actor): Promise<void> {
  if (!actor.isGuest) return;
  await repos.members.lockUserQuota(actor.userId);
  if ((await repos.tasks.countByBoards(await boardIdsOf(repos.members, actor))) >= GUEST_MAX_TASKS) {
    throw new ConflictError(`Guest limit reached: at most ${GUEST_MAX_TASKS} tasks. Sign up to create more.`);
  }
}
