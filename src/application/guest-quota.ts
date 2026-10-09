import { ConflictError } from "@/domain/errors";
import type { Actor } from "./actor";
import type { MemberRepo, TaskRepo } from "./ports/repositories";

/** Abuse limits for anonymous users (REQ-SEC-04); real accounts are unrestricted. */
export const GUEST_MAX_BOARDS = 3;
export const GUEST_MAX_TASKS = 200;

async function ownedBoardIds(members: MemberRepo, actor: Actor): Promise<string[]> {
  return (await members.listByUser(actor.userId)).filter((m) => m.role === "owner").map((m) => m.boardId);
}

/**
 * Called inside the creating transaction. The quota is a soft limit under concurrency: parallel creations by
 * the same guest can overshoot by the number of requests in flight, which is bounded by the rate limits.
 */
export async function assertGuestBoardQuota(members: MemberRepo, actor: Actor): Promise<void> {
  if (!actor.isGuest) return;
  if ((await ownedBoardIds(members, actor)).length >= GUEST_MAX_BOARDS) {
    throw new ConflictError(`Guest limit reached: at most ${GUEST_MAX_BOARDS} boards. Sign up to create more.`);
  }
}

export async function assertGuestTaskQuota(repos: { members: MemberRepo; tasks: TaskRepo }, actor: Actor): Promise<void> {
  if (!actor.isGuest) return;
  const boardIds = await ownedBoardIds(repos.members, actor);
  if ((await repos.tasks.countByBoards(boardIds)) >= GUEST_MAX_TASKS) {
    throw new ConflictError(`Guest limit reached: at most ${GUEST_MAX_TASKS} tasks. Sign up to create more.`);
  }
}
