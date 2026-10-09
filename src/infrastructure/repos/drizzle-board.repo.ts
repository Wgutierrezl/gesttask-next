import { and, asc, eq } from "drizzle-orm";
import type { Board } from "@/domain/entities/board";
import type { BoardRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { boardMembers, boards } from "../db/schema";
import { exec } from "./drizzle-errors";

/** `lock` is true for repos handed out inside a transaction: reads take `FOR UPDATE` (see ports contract). */
export function createBoardRepo(db: Database, lock: boolean): BoardRepo {
  return {
    insert: async (board) => void (await exec(db.insert(boards).values(board))),
    findById: async (id) => {
      const query = db.select().from(boards).where(eq(boards.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    // Paginated listing: a snapshot read for the UI, never used to mutate (see the ports contract).
    listByMember: (userId, page) =>
      exec(
        db
          .select({ id: boards.id, name: boards.name, description: boards.description, status: boards.status, createdAt: boards.createdAt })
          .from(boards)
          .innerJoin(boardMembers, and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)))
          .orderBy(asc(boards.createdAt), asc(boards.id))
          .limit(page.limit)
          .offset(page.offset),
      ),
    update: async (board: Board) =>
      void (await exec(
        db.update(boards).set({ name: board.name, description: board.description, status: board.status }).where(eq(boards.id, board.id)),
      )),
    delete: async (id) => void (await exec(db.delete(boards).where(eq(boards.id, id)))),
  };
}
