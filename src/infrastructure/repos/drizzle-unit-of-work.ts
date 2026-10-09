import type { Repos, UnitOfWork } from "@/application/ports/repositories";
import type { Database } from "../db/client";
import { isTransientTransactionError } from "../db/pg-error";
import { createDrizzleRepos } from "./drizzle-repos";

export interface UnitOfWorkOptions {
  /** Total attempts including the first one. */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const BASE_BACKOFF_MS = 25;

/**
 * One real Postgres transaction (explicit READ COMMITTED) per attempt. Repos handed to `work` lock the
 * rows they read; any throw rolls everything back and is rethrown unchanged. After a failed statement the
 * transaction is aborted, so `work` must not swallow a repository error and keep going.
 *
 * A deadlock (40P01) or serialization failure (40001) rolls the victim back, and the whole `work` is run
 * again (up to `maxAttempts`, exponential backoff with jitter), so `work` must be safe to re-execute: it
 * may only touch the database through the repos it receives.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly db: Database,
    options: UnitOfWorkOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
  }

  async run<T>(work: (repos: Repos) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.db.transaction((tx) => work(createDrizzleRepos(tx, true)), { isolationLevel: "read committed" });
      } catch (error) {
        if (attempt >= this.maxAttempts || !isTransientTransactionError(error)) throw error;
        await this.sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1) * (0.5 + this.random()));
      }
    }
  }
}
