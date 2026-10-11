import { drainStorageDeletions, type DrainResult } from "@/application/drain-storage-deletions";
import type { Clock, StoragePort } from "@/application/ports/services";
import { enqueueAttachmentCleanup } from "@/application/storage-cleanup";
import { sweepPendingUploads, type SweepResult } from "@/application/sweep-pending-uploads";
import { sql } from "drizzle-orm";
import { purgeExpiredGuests, type PurgeOptions, type PurgeResult } from "./auth/purge-guests";
import type { Database } from "./db/client";
import type { Logger } from "./logging/logger";
import { DrizzleDeletionOutbox } from "./repos/drizzle-deletion-outbox";
import { createDrizzleRepos } from "./repos/drizzle-repos";
import { PgRateLimiter } from "./ratelimit/pg-rate-limiter";
import { DrizzleUnitOfWork } from "./repos/drizzle-unit-of-work";

/** Rate-limit windows are at most an hour long (uploads); a day of history is far more than any rule can still look at. */
const RATE_LIMIT_RETENTION_MS = 24 * 3_600_000;

/**
 * The `beforeDeleteBoards` hook of the guest purge: inside the purge transaction, lock each board and queue the storage
 * keys of everything on it (pending uploads included), so no object outlives its rows (REQ-CAS-02, REQ-CAS-03).
 * Boards are visited in id order, like every other multi-board lock in the purge.
 */
export const queueBoardAttachmentKeys: PurgeOptions["beforeDeleteBoards"] = async (tx, boardIds) => {
  const repos = createDrizzleRepos(tx, true);
  for (const boardId of [...boardIds].sort()) {
    await repos.boards.findById(boardId);
    await enqueueAttachmentCleanup(repos, { boardId });
  }
};

export interface Maintenance {
  /** Deletes queued objects from the storage; safe to run any time, concurrently, and repeatedly. */
  drainStorageDeletions(): Promise<DrainResult>;
  /** Removes expired demo guests with their sandboxes, queueing their objects in the same transaction. */
  purgeExpiredGuests(): Promise<PurgeResult>;
  /** Deletes uploads never attached to a comment after one hour, queueing their objects in the same transaction. */
  sweepPendingUploads(): Promise<SweepResult>;
  /** Deletes rate-limit windows that can no longer matter. */
  purgeRateLimits(): Promise<{ purged: number }>;
  /** A trivial query: wakes a suspended database (Neon scales to zero) and proves the connection before the real jobs run. */
  warmUp(): Promise<void>;
}

/** Background jobs that have no signed-in user. The cron route and the post-delete hooks are the callers. */
export function createMaintenance(deps: { db: Database; clock: Clock; storage: StoragePort; logger: Logger }): Maintenance {
  return {
    drainStorageDeletions: () =>
      drainStorageDeletions(
        { outbox: new DrizzleDeletionOutbox(deps.db), storage: deps.storage },
        { onError: (error, key) => deps.logger.warn("storage deletion failed, will retry", { storageKey: key, error }) },
      ),
    sweepPendingUploads: () => sweepPendingUploads({ uow: new DrizzleUnitOfWork(deps.db), clock: deps.clock }),
    purgeExpiredGuests: () => purgeExpiredGuests(deps.db, { now: deps.clock.now(), beforeDeleteBoards: queueBoardAttachmentKeys }),
    purgeRateLimits: async () => ({
      purged: await new PgRateLimiter(deps.db, deps.clock).purgeStartedBefore(new Date(deps.clock.now().getTime() - RATE_LIMIT_RETENTION_MS)),
    }),
    warmUp: async () => void (await deps.db.execute(sql`SELECT 1`)),
  };
}

export type ScheduledJob = "warmUp" | "purgeExpiredGuests" | "sweepPendingUploads" | "drainStorageDeletions" | "purgeRateLimits";
export type JobOutcome = { ok: true; result?: unknown } | { ok: false };

export interface ScheduledReport {
  ok: boolean;
  startedAt: string;
  durationMs: number;
  jobs: Partial<Record<ScheduledJob, JobOutcome>>;
}

/**
 * The cron run. Order matters: the jobs that queue storage keys (guest purge, upload sweep) come before the drain, so one run
 * also deletes what it just queued; the limiter trim is last because it matters least. Each job is isolated: one failing
 * (logged by name, the error stays out of the report) never stops the rest, and the report says which failed.
 */
export async function runScheduledMaintenance(maintenance: Maintenance, deps: { logger: Logger; clock: Clock }): Promise<ScheduledReport> {
  const started = deps.clock.now();
  const jobs: ScheduledReport["jobs"] = {};
  const steps: [ScheduledJob, () => Promise<unknown>][] = [
    ["warmUp", () => maintenance.warmUp()],
    ["purgeExpiredGuests", () => maintenance.purgeExpiredGuests()],
    ["sweepPendingUploads", () => maintenance.sweepPendingUploads()],
    ["drainStorageDeletions", () => maintenance.drainStorageDeletions()],
    ["purgeRateLimits", () => maintenance.purgeRateLimits()],
  ];
  for (const [job, run] of steps) {
    try {
      const result = await run();
      jobs[job] = result === undefined ? { ok: true } : { ok: true, result };
    } catch (error) {
      deps.logger.error("scheduled maintenance job failed", { job, error });
      jobs[job] = { ok: false };
    }
  }
  const finished = deps.clock.now();
  return {
    ok: Object.values(jobs).every((outcome) => outcome.ok),
    startedAt: started.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    jobs,
  };
}
