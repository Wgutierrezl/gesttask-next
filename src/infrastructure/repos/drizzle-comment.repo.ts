import { asc, eq } from "drizzle-orm";
import type { CommentRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { comments } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = {
  id: comments.id, taskId: comments.taskId, boardId: comments.boardId, authorId: comments.authorId, body: comments.body,
  createdAt: comments.createdAt,
};

export function createCommentRepo(db: Database, lock: boolean): CommentRepo {
  return {
    insert: async (comment) => void (await exec(db.insert(comments).values(comment))),
    findById: async (id) => {
      const query = db.select(columns).from(comments).where(eq(comments.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    // Paginated listing: a snapshot read.
    listByTask: (taskId, page) =>
      exec(
        db.select(columns).from(comments).where(eq(comments.taskId, taskId))
          .orderBy(asc(comments.createdAt), asc(comments.id)).limit(page.limit).offset(page.offset),
      ),
    updateBody: async (id, body) => void (await exec(db.update(comments).set({ body }).where(eq(comments.id, id)))),
    delete: async (id) => void (await exec(db.delete(comments).where(eq(comments.id, id)))),
  };
}
