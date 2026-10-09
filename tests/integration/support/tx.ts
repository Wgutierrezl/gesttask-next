import { randomUUID } from "node:crypto";
import type { AppDeps } from "@/application/deps";
import { sql } from "drizzle-orm";
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

/**
 * Resolves once `count` backends are waiting on a lock, i.e. a transaction is provably blocked behind
 * another one. Deterministic replacement for "sleep and check it has not finished yet".
 */
export async function waitUntilBlocked(handle: DbHandle, count = 1, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await handle.db.execute<{ waiting: number }>(sql`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
    if ((rows[0]?.waiting ?? 0) >= count) return;
    if (Date.now() > deadline) throw new Error(`no transaction became blocked on a lock within ${timeoutMs} ms`);
    await sleep(10);
  }
}

/** Tracks whether a promise has settled, without awaiting it. */
export function track<T>(promise: Promise<T>): { promise: Promise<T>; settled: () => boolean } {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { promise, settled: () => done };
}
