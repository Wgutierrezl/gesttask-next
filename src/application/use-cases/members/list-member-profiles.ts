import type { BoardRole } from "@/domain/value-objects/board-role";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import type { UserDirectory } from "../../ports/services";
import { listByBoardSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

export interface MemberProfile {
  userId: string;
  role: BoardRole;
  name: string;
  email: string | null;
}

/** Members of a board with the names the UI shows; an account that vanished reads "Deleted user". */
export function makeListMemberProfiles(deps: AppDeps, users: UserDirectory) {
  return async (actor: Actor, input: unknown): Promise<MemberProfile[]> => {
    const { boardId, ...page } = parseInput(listByBoardSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    const members = await deps.repos.members.listByBoard(boardId, page);
    const profiles = new Map((await users.findByIds(members.map((m) => m.userId))).map((p) => [p.id, p]));
    return members.map(({ userId, role }) => {
      const profile = profiles.get(userId);
      return { userId, role, name: profile?.name ?? "Deleted user", email: profile?.email ?? null };
    });
  };
}
