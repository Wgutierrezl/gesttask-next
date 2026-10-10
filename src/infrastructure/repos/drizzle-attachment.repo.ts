import { and, asc, count, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { AttachmentRepo, AttachmentScope } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { attachments, comments, pipelines, tasks } from "../db/schema";
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
    deleteAbandoned: async (before, limit) => {
      const abandoned = and(eq(attachments.status, "pending"), lt(attachments.createdAt, before));
      // Two statements: SKIP LOCKED leaves rows another transaction is linking, and a LIMIT + FOR UPDATE subselect inside
      // the DELETE is re-planned by Postgres and may take more than `limit` rows. The delete re-checks its conditions.
      const batch = await exec(
        db.select({ id: attachments.id }).from(attachments).where(abandoned)
          .orderBy(asc(attachments.createdAt), asc(attachments.id)).limit(limit).for("update", { skipLocked: true }),
      );
      if (batch.length === 0) return [];
      const deleted = await exec(
        db.delete(attachments).where(and(inArray(attachments.id, batch.map((r) => r.id)), abandoned))
          .returning({ key: attachments.storageKey, createdAt: attachments.createdAt, id: attachments.id }),
      );
      return deleted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1)).map((r) => r.key);
    },
    keysUnder: async (scope) => {
      if ("boardId" in scope) {
        if (lock) {
          // Top-down like everyone else (pipelines, stages, tasks): a writer inside a pipeline holds the pipeline row
          // before its tasks, so locking the tasks first would cross it and deadlock.
          await exec(db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.boardId, scope.boardId)).orderBy(asc(pipelines.id)).for("update"));
          await exec(db.select({ id: tasks.id }).from(tasks).where(eq(tasks.boardId, scope.boardId)).orderBy(asc(tasks.id)).for("update"));
        }
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
