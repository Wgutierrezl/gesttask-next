import type { RepoHarness } from "@tests/support/contracts/harness";
import { createDrizzleRepos } from "@/infrastructure/repos/drizzle-repos";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";
import { connectTestDb, resetDb } from "./db";

/** Drizzle adapters bound to the `_test` database; the contract suites run against this and the fakes. */
export function drizzleHarness(): RepoHarness {
  const handle = connectTestDb();
  return {
    repos: createDrizzleRepos(handle.db, false),
    uow: new DrizzleUnitOfWork(handle.db),
    reset: () => resetDb(handle),
    close: () => handle.close(),
  };
}
