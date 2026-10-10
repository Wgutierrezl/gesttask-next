import { can } from "@/domain/policy/board-policy";
import type { BoardRole } from "@/domain/value-objects/board-role";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { UserDirectory } from "../../ports/services";
import { listMemberProfilesSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

export interface MemberProfile {
  userId: string;
  role: BoardRole;
  name: string;
  email: string | null;
}

/**
 * Members of a board with the names the UI shows; an account that vanished reads "Deleted user".
 * Emails go only to callers who may manage members: a plain member or guest sees names, never addresses.
 */
export function makeListMemberProfiles(deps: AppDeps, users: UserDirectory) {
  return async (actor: Actor, input: unknown): Promise<MemberProfile[]> => {
    const { boardId, userIds, ...page } = parseInput(listMemberProfilesSchema, input);
    const viewerRole = await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    const seesEmails = can(viewerRole, "member:manage");
    // By id: only the people on screen, so a board with more members than a page still labels everyone correctly.
    const members = userIds
      ? (await Promise.all([...new Set(userIds)].map((userId) => deps.repos.members.find(boardId, userId)))).filter((m) => m !== null)
      : await deps.repos.members.listByBoard(boardId, page);
    const profiles = new Map((await users.findByIds(members.map((m) => m.userId))).map((p) => [p.id, p]));
    return members.map(({ userId, role }) => {
      const profile = profiles.get(userId);
      return { userId, role, name: profile?.name ?? "Deleted user", email: seesEmails ? (profile?.email ?? null) : null };
    });
  };
}
