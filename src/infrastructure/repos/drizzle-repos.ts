import type { Repos } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { createBoardRepo } from "./drizzle-board.repo";
import { createMemberRepo } from "./drizzle-member.repo";
import { createPipelineRepo } from "./drizzle-pipeline.repo";
import { createStageRepo } from "./drizzle-stage.repo";
import { createTaskRepo } from "./drizzle-task.repo";

/**
 * Binds every repository to `db`, which is either the pool (plain snapshot reads, `lock = false`) or a
 * transaction (reads lock the rows they return, `lock = true`).
 */
export function createDrizzleRepos(db: Database, lock: boolean): Repos {
  return {
    boards: createBoardRepo(db, lock),
    members: createMemberRepo(db, lock),
    pipelines: createPipelineRepo(db, lock),
    stages: createStageRepo(db, lock),
    tasks: createTaskRepo(db, lock),
  };
}
