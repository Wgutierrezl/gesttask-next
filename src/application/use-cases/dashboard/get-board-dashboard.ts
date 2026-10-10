import { NotFoundError } from "@/domain/errors";
import type { BoardDashboard } from "@/domain/entities/dashboard";
import type { Actor } from "../../actor";
import { requireBoardAccess } from "../../authorize";
import type { AppDeps } from "../../deps";
import { boardIdSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";
import { todayOf } from "./_today";

/**
 * The counts of one board: members, and tasks by stage, priority, status and overdue, empty stages included
 * (REQ-DSH-01, REQ-DSH-02). Any member may see it, the guest role too; everyone else gets NotFound (REQ-DSH-03).
 * One aggregation query after the membership check, however big the board is.
 */
export function makeGetBoardDashboard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<BoardDashboard> => {
    const { boardId } = parseInput(boardIdSchema, input);
    await requireBoardAccess(deps.repos.members, actor, boardId, "board:view");
    const dashboard = await deps.repos.dashboard.forBoard(boardId, todayOf(deps));
    if (!dashboard) throw new NotFoundError(); // deleted between the check and the read
    return dashboard;
  };
}
