import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { createDrizzleRepos } from "./drizzle-repos";

/**
 * One real Postgres transaction (READ COMMITTED) per `run`. Repos handed to `work` lock the rows they
 * read; any throw rolls everything back and is rethrown unchanged. After a failed statement the
 * transaction is aborted, so `work` must not swallow a repository error and keep going.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  run<T>(work: (repos: Repos) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(createDrizzleRepos(tx, true)));
  }
}
