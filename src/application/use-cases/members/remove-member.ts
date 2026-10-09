import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { parseInput } from "../../schemas/parse";
import { memberTargetSchema } from "../../schemas/member";
import { assertNotLastOwner } from "./_last-owner";

export function makeRemoveMember(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { boardId, userId } = parseInput(memberTargetSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "member:manage");
    await deps.uow.run(async (tx) => {
      const target = await tx.members.find(boardId, userId);
      if (!target) throw new NotFoundError();
      await assertNotLastOwner(tx.members, target);
      await tx.members.remove(boardId, userId);
      await tx.tasks.clearAssignee(boardId, userId);
    });
  };
}
