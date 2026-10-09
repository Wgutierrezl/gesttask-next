import { asc, eq, sql } from "drizzle-orm";
import type { PipelineRepo } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { pipelines } from "../db/schema";
import { exec } from "./drizzle-errors";

const columns = { id: pipelines.id, boardId: pipelines.boardId, name: pipelines.name, description: pipelines.description };

export function createPipelineRepo(db: Database, lock: boolean): PipelineRepo {
  return {
    insert: async (pipeline) => void (await exec(db.insert(pipelines).values(pipeline))),
    findById: async (id) => {
      const query = db.select(columns).from(pipelines).where(eq(pipelines.id, id)).limit(1);
      const [row] = await exec(lock ? query.for("update") : query);
      return row ?? null;
    },
    // Paginated listing: a snapshot read, bytewise by name like the domain's comparePositions.
    listByBoard: (boardId, page) =>
      exec(
        db
          .select(columns)
          .from(pipelines)
          .where(eq(pipelines.boardId, boardId))
          .orderBy(sql`${pipelines.name} COLLATE "C"`, asc(pipelines.id))
          .limit(page.limit)
          .offset(page.offset),
      ),
    update: async (pipeline) =>
      void (await exec(
        db.update(pipelines).set({ name: pipeline.name, description: pipeline.description }).where(eq(pipelines.id, pipeline.id)),
      )),
    delete: async (id) => void (await exec(db.delete(pipelines).where(eq(pipelines.id, id)))),
  };
}
