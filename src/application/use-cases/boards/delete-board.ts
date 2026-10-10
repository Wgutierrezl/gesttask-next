import { NotFoundError } from "@/domain/errors";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";
import { enqueueAttachmentCleanup } from "../../storage-cleanup";

/**
 * Owner only; dependents go away with the board inside one transaction (REQ-CAS-01), and the storage keys of every
 * attachment on it are queued in that same transaction (REQ-CAS-02).
 */
export function makeDeleteBoard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<void> => {
    const { boardId } = parseInput(boardIdSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:delete");
    await deps.uow.run(async (tx) => {
      // Locking the board row first makes a concurrent upload request wait, so its pending row cannot appear unqueued.
      if (!(await tx.boards.findById(boardId))) throw new NotFoundError();
      await enqueueAttachmentCleanup(tx, { boardId });
      await tx.boards.delete(boardId);
    });
  };
}
