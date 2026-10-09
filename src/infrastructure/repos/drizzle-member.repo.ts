import { and, asc, eq, sql } from "drizzle-orm";
import type { MemberRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { boardMembers } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = { boardId: boardMembers.boardId, userId: boardMembers.userId, role: boardMembers.role };
const isMember = (boardId: string, userId: string) => and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId));

export function createMemberRepo(db: Database, lock: boolean): MemberRepo {
  return {
    insert: async (member) => void (await exec(db.insert(boardMembers).values(member))),
    find: async (boardId, userId) => {
      const query = db.select(columns).from(boardMembers).where(isMember(boardId, userId)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    // Bytewise order like the domain's comparePositions; paginated listings are snapshot reads.
    listByBoard: (boardId, page) =>
      exec(
        db
          .select(columns)
          .from(boardMembers)
          .where(eq(boardMembers.boardId, boardId))
          .orderBy(sql`${boardMembers.userId} COLLATE "C"`)
          .limit(page.limit)
          .offset(page.offset),
      ),
    listByUser: (userId) =>
      exec(db.select(columns).from(boardMembers).where(eq(boardMembers.userId, userId)).orderBy(asc(boardMembers.boardId))),
    updateRole: async (boardId, userId, role) =>
      void (await exec(db.update(boardMembers).set({ role }).where(isMember(boardId, userId)))),
    remove: async (boardId, userId) => void (await exec(db.delete(boardMembers).where(isMember(boardId, userId)))),
    countByRole: async (boardId, role) => {
      // Inside a transaction the matching rows are locked in primary-key order, so a concurrent
      // demotion/removal waits and then re-evaluates `role` against the committed state.
      const rows = lock
        ? sql`SELECT count(*)::int AS n FROM (
                SELECT 1 FROM board_members WHERE board_id = ${boardId} AND role = ${role}
                ORDER BY user_id FOR UPDATE) locked`
        : sql`SELECT count(*)::int AS n FROM board_members WHERE board_id = ${boardId} AND role = ${role}`;
      const result = await exec(db.execute<{ n: number }>(rows));
      return result.rows[0]?.n ?? 0;
    },
  };
}
