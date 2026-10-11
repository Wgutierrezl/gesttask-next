import { and, asc, eq, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { DashboardRepo } from "@/application/ports/repositories";
import { buildBoardDashboard, type TaskCounts } from "@/domain/entities/dashboard";
import type { Database } from "../db/client";
import { boardMembers, boards, pipelines, stages, tasks } from "../db/schema";
import { exec } from "./drizzle-errors";

const countOf = (condition?: SQL) =>
  condition ? sql<number>`(count(${tasks.id}) filter (where ${condition}))::int` : sql<number>`(count(${tasks.id}))::int`;

/** The counting columns shared by both dashboards: `count(tasks.id)` is 0 for the null row of an outer join. */
const countColumns = (today: string) => ({
  total: countOf(),
  low: countOf(eq(tasks.priority, "low")),
  medium: countOf(eq(tasks.priority, "medium")),
  high: countOf(eq(tasks.priority, "high")),
  active: countOf(eq(tasks.status, "active")),
  inactive: countOf(eq(tasks.status, "inactive")),
  overdue: countOf(and(isNotNull(tasks.dueDate), isNull(tasks.completedAt), lt(tasks.dueDate, today))),
});

interface CountRow {
  total: number;
  low: number;
  medium: number;
  high: number;
  active: number;
  inactive: number;
  overdue: number;
}

const toCounts = (row: CountRow): TaskCounts => ({
  total: row.total,
  byPriority: { low: row.low, medium: row.medium, high: row.high },
  byStatus: { active: row.active, inactive: row.inactive },
  overdue: row.overdue,
});

export function createDashboardRepo(db: Database): DashboardRepo {
  return {
    forUser: async (userId, today) => {
      // The join to the user's membership is what keeps a stale assignment (a board the user left) out of the numbers.
      const [row] = await exec(
        db
          .select({
            boards: sql<number>`(select count(*) from ${boardMembers} where ${boardMembers.userId} = ${userId})::int`,
            ...countColumns(today),
          })
          .from(tasks)
          .innerJoin(boardMembers, and(eq(boardMembers.boardId, tasks.boardId), eq(boardMembers.userId, userId)))
          .where(eq(tasks.assigneeId, userId)),
      );
      // An aggregate without GROUP BY always yields one row; the guard only satisfies the types.
      return { boards: row?.boards ?? 0, assigned: toCounts(row as CountRow) };
    },

    forBoard: async (boardId, today) => {
      // Starting from the board row guarantees one row even for a board with no pipelines, and says whether it exists.
      const rows = await exec(
        db
          .select({
            members: sql<number>`(select count(*) from ${boardMembers} where ${boardMembers.boardId} = ${boards.id})::int`,
            pipelineId: pipelines.id,
            pipelineName: pipelines.name,
            stageId: stages.id,
            stageName: stages.name,
            isDone: stages.isDone,
            ...countColumns(today),
          })
          .from(boards)
          .leftJoin(pipelines, eq(pipelines.boardId, boards.id))
          .leftJoin(stages, eq(stages.pipelineId, pipelines.id))
          .leftJoin(tasks, eq(tasks.stageId, stages.id))
          .where(eq(boards.id, boardId))
          .groupBy(boards.id, pipelines.id, stages.id)
          .orderBy(sql`${pipelines.name} COLLATE "C"`, asc(pipelines.id), asc(stages.position), asc(stages.id)),
      );
      const first = rows[0];
      if (!first) return null;
      return buildBoardDashboard(
        boardId,
        first.members,
        rows.flatMap((row) =>
          row.pipelineId === null
            ? []
            : [
                {
                  pipelineId: row.pipelineId,
                  pipelineName: row.pipelineName!,
                  stage: row.stageId === null ? null : { id: row.stageId, name: row.stageName!, isDone: row.isDone!, tasks: toCounts(row) },
                },
              ],
        ),
      );
    },
  };
}
