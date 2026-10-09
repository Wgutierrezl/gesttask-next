import type { Repos } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { createBoardRepo } from "./drizzle-board.repo";
import { createMemberRepo } from "./drizzle-member.repo";
import { createPipelineRepo } from "./drizzle-pipeline.repo";
import { createStageRepo } from "./drizzle-stage.repo";

/** Tasks arrive in the next stacked branch; touching them fails loudly. */
function notYet(name: string): never {
  throw new Error(`${name} repository is not implemented yet`);
}
const pending = <T extends object>(name: string): T =>
  new Proxy({}, { get: () => () => notYet(name) }) as T;

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
    tasks: pending("task"),
  };
}
