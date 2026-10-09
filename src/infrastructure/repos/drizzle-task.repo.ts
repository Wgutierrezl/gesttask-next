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
    // One UPDATE; Postgres locks the matched rows itself.
    clearAssignee: async (boardId, userId) =>
      void (await exec(db.update(tasks).set({ assigneeId: null }).where(and(eq(tasks.boardId, boardId), eq(tasks.assigneeId, userId))))),
    listByStage: (stageId) => {
      const ordered = db.select(columns).from(tasks);
      if (!lock) return exec(ordered.where(eq(tasks.stageId, stageId)).orderBy(asc(tasks.position), asc(tasks.id)));
      // Lock in primary-key order (the global order), return position-ordered.
      const locked = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.stageId, stageId)).orderBy(asc(tasks.id)).for("update");
      return exec(ordered.where(inArray(tasks.id, locked)).orderBy(asc(tasks.position), asc(tasks.id)));
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
