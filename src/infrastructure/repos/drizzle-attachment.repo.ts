import { and, asc, count, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { AttachmentRepo, AttachmentScope } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { attachments, comments, tasks } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = {
  id: attachments.id, commentId: attachments.commentId, boardId: attachments.boardId, uploaderId: attachments.uploaderId,
  storageKey: attachments.storageKey, fileName: attachments.fileName, contentType: attachments.contentType,
  size: attachments.size, status: attachments.status, createdAt: attachments.createdAt,
};

/** The task rows a scope's comments hang from, as a filter on `tasks`. */
function tasksOf(scope: Exclude<AttachmentScope, { commentId: string } | { boardId: string }>) {
  if ("taskId" in scope) return eq(tasks.id, scope.taskId);
  if ("stageId" in scope) return eq(tasks.stageId, scope.stageId);
  return eq(tasks.pipelineId, scope.pipelineId);
}

export function createAttachmentRepo(db: Database, lock: boolean): AttachmentRepo {
  const keys = async (filter: ReturnType<typeof eq>): Promise<string[]> =>
    (await exec(db.select({ key: attachments.storageKey }).from(attachments).where(filter).orderBy(asc(attachments.id)))).map((r) => r.key);

  return {
    insert: async (attachment) => void (await exec(db.insert(attachments).values(attachment))),
    findById: async (id) => {
      const query = db.select(columns).from(attachments).where(eq(attachments.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    findManyByIds: async (ids) => {
      if (ids.length === 0) return [];
      const query = db.select(columns).from(attachments).where(inArray(attachments.id, [...ids])).orderBy(asc(attachments.id));
      return exec(lock ? query.for("update") : query);
    },
    confirm: async (id, link) =>
      void (await exec(
        db.update(attachments).set({ commentId: link.commentId, size: link.size, status: "confirmed" }).where(eq(attachments.id, id)),
      )),
    listByComments: async (commentIds) => {
      if (commentIds.length === 0) return [];
      return exec(
        db.select(columns).from(attachments)
          .where(and(eq(attachments.status, "confirmed"), inArray(attachments.commentId, [...commentIds])))
          .orderBy(asc(attachments.createdAt), asc(attachments.id)),
      );
    },
    countByUploader: async (userId, pendingSince) => {
      const [row] = await exec(
        db.select({ n: count() }).from(attachments)
          .where(and(eq(attachments.uploaderId, userId), or(eq(attachments.status, "confirmed"), gte(attachments.createdAt, pendingSince)))),
      );
      return Number(row?.n ?? 0);
    },
    keysUnder: async (scope) => {
      if ("boardId" in scope) {
        if (lock) await exec(db.select({ id: tasks.id }).from(tasks).where(eq(tasks.boardId, scope.boardId)).orderBy(asc(tasks.id)).for("update"));
        return keys(eq(attachments.boardId, scope.boardId));
      }
      if ("commentId" in scope) return keys(eq(attachments.commentId, scope.commentId));
      // Lock the tasks first (primary-key order, the global lock order): a comment insert holds a KEY SHARE lock on its
      // task, so a concurrent createComment finishes before we read, or waits until our transaction ends.
      const owners = tasksOf(scope);
      if (lock) await exec(db.select({ id: tasks.id }).from(tasks).where(owners).orderBy(asc(tasks.id)).for("update"));
      const doomed = db.select({ id: comments.id }).from(comments).innerJoin(tasks, eq(tasks.id, comments.taskId)).where(owners);
      return keys(sql`${attachments.commentId} IN (${doomed})` as ReturnType<typeof eq>);
    },
  };
}
