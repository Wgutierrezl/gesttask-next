import { and, asc, eq, inArray } from "drizzle-orm";
import type { TaskRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { stages, tasks } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = {
  id: tasks.id, boardId: tasks.boardId, pipelineId: tasks.pipelineId, stageId: tasks.stageId, title: tasks.title,
  description: tasks.description, priority: tasks.priority, status: tasks.status, dueDate: tasks.dueDate,
  assigneeId: tasks.assigneeId, completedAt: tasks.completedAt, position: tasks.position, createdAt: tasks.createdAt,
};

export function createTaskRepo(db: Database, lock: boolean): TaskRepo {
  return {
    insert: async (task) => void (await exec(db.insert(tasks).values(task))),
    findById: async (id) => {
      const query = db.select(columns).from(tasks).where(eq(tasks.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    update: async (task) => {
      const { id, ...values } = task;
      await exec(db.update(tasks).set(values).where(eq(tasks.id, id)));
    },
    delete: async (id) => void (await exec(db.delete(tasks).where(eq(tasks.id, id)))),
    clearAssignee: async (boardId, userId) => {
      const target = and(eq(tasks.boardId, boardId), eq(tasks.assigneeId, userId));
      if (!lock) return void (await exec(db.update(tasks).set({ assigneeId: null }).where(target)));
      // A bare UPDATE locks rows in physical order, which can cross the global primary-key order and
      // deadlock with another transaction. Lock the targets in PK order first, then update exactly those.
      const rows = await exec(db.select({ id: tasks.id }).from(tasks).where(target).orderBy(asc(tasks.id)).for("update"));
      if (rows.length === 0) return;
      await exec(
        db.update(tasks).set({ assigneeId: null }).where(and(inArray(tasks.id, rows.map((r) => r.id)), eq(tasks.assigneeId, userId))),
      );
    },
    listByStage: (stageId) => {
      const ordered = () => exec(db.select(columns).from(tasks).where(eq(tasks.stageId, stageId)).orderBy(asc(tasks.position), asc(tasks.id)));
      if (!lock) return ordered();
      // Two statements on purpose: lock in primary-key order (the global order), then read with a fresh
      // snapshot. A single `WHERE id IN (SELECT ... FOR UPDATE)` reads with the snapshot taken before the
      // lock wait and would return stale rows committed meanwhile by another transaction.
      // The stage row is locked first for the same reason as in the stage repo: task inserts and moves into
      // the stage hold a KEY SHARE lock on it for their foreign key, so they wait instead of appearing as phantoms.
      return (async () => {
        await exec(db.select({ id: stages.id }).from(stages).where(eq(stages.id, stageId)).for("update"));
        await exec(db.select({ id: tasks.id }).from(tasks).where(eq(tasks.stageId, stageId)).orderBy(asc(tasks.id)).for("update"));
        return ordered();
      })();
    },
    // Paginated listing: a snapshot read. Columns follow stage position, then stage id, so pages never interleave.
    listByPipeline: (pipelineId, page) =>
      exec(
        db
          .select(columns)
          .from(tasks)
          .innerJoin(stages, eq(stages.id, tasks.stageId))
          .where(eq(tasks.pipelineId, pipelineId))
          .orderBy(asc(stages.position), asc(stages.id), asc(tasks.position), asc(tasks.id))
          .limit(page.limit)
          .offset(page.offset),
      ),
  };
}
