import { asc, eq } from "drizzle-orm";
import type { StageRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { stages } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = {
  id: stages.id, pipelineId: stages.pipelineId, boardId: stages.boardId, name: stages.name, isDone: stages.isDone,
  position: stages.position,
};

export function createStageRepo(db: Database, lock: boolean): StageRepo {
  return {
    // Unique violations (lower(name), single done stage) surface as ConflictError via `exec`.
    insert: async (stage) => void (await exec(db.insert(stages).values(stage))),
    findById: async (id) => {
      const query = db.select(columns).from(stages).where(eq(stages.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    listByPipeline: (pipelineId, page) => {
      if (page) {
        return exec(
          db.select(columns).from(stages).where(eq(stages.pipelineId, pipelineId))
            .orderBy(asc(stages.position), asc(stages.id)).limit(page.limit).offset(page.offset),
        );
      }
      if (!lock) {
        return exec(db.select(columns).from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position), asc(stages.id)));
      }
      // Two statements on purpose. First lock in primary-key order (the global order); only then read.
      // A single `WHERE id IN (SELECT ... FOR UPDATE)` would take its snapshot BEFORE waiting for the
      // locks and return rows another transaction committed meanwhile in their stale form.
      return (async () => {
        await exec(db.select({ id: stages.id }).from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.id)).for("update"));
        return exec(db.select(columns).from(stages).where(eq(stages.pipelineId, pipelineId)).orderBy(asc(stages.position), asc(stages.id)));
      })();
    },
    update: async (stage) =>
      void (await exec(
        db
          .update(stages)
          .set({ pipelineId: stage.pipelineId, boardId: stage.boardId, name: stage.name, isDone: stage.isDone, position: stage.position })
          .where(eq(stages.id, stage.id)),
      )),
    delete: async (id) => void (await exec(db.delete(stages).where(eq(stages.id, id)))),
  };
}
