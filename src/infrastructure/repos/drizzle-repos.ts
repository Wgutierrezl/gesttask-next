import type { Repos } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { createBoardRepo } from "./drizzle-board.repo";
import { createMemberRepo } from "./drizzle-member.repo";

/** Pipelines, stages and tasks arrive in the next stacked branches; touching them fails loudly. */
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
    pipelines: pending("pipeline"),
    stages: pending("stage"),
    tasks: pending("task"),
  };
}
