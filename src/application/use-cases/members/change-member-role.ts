import { NotFoundError } from "@/domain/errors";
import type { BoardMember } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { changeMemberRoleSchema } from "../../schemas/member";
import { assertNotLastOwner } from "./_last-owner";

export function makeChangeMemberRole(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<BoardMember> => {
    const { boardId, userId, role } = parseInput(changeMemberRoleSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "member:manage");
    return deps.uow.run(async (tx) => {
      const target = await tx.members.find(boardId, userId);
      if (!target) throw new NotFoundError();
      if (target.role !== role) {
        await assertNotLastOwner(tx.members, target);
        await tx.members.updateRole(boardId, userId, role);
      }
      return { boardId, userId, role };
    });
  };
}
