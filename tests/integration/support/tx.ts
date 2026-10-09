import { randomUUID } from "node:crypto";
import type { AppDeps } from "@/application/deps";
import type { DbHandle } from "@/infrastructure/db/client";
import { createDrizzleRepos } from "@/infrastructure/repos/drizzle-repos";
import { DrizzleUnitOfWork } from "@/infrastructure/repos/drizzle-unit-of-work";

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Real application dependencies over Postgres: real transactions, real clock, UUID ids. */
export function drizzleDeps(handle: DbHandle): AppDeps {
  return {
    uow: new DrizzleUnitOfWork(handle.db),
    repos: createDrizzleRepos(handle.db, false),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
  };
}

/** Reports whether `promise` settled within `ms`; used to prove a transaction is blocked on a lock. */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await sleep(ms);
  return settled;
}
