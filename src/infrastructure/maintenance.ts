import { drainStorageDeletions, type DrainResult } from "@/application/drain-storage-deletions";
import type { Clock, StoragePort } from "@/application/ports/services";
import { enqueueAttachmentCleanup } from "@/application/storage-cleanup";
import { purgeExpiredGuests, type PurgeOptions, type PurgeResult } from "./auth/purge-guests";
import type { Database } from "./db/client";
import type { Logger } from "./logging/logger";
import { DrizzleDeletionOutbox } from "./repos/drizzle-deletion-outbox";
import { createDrizzleRepos } from "./repos/drizzle-repos";

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
}

/** Background jobs that have no signed-in user. The cron route (slice 9) is the only caller. */
export function createMaintenance(deps: { db: Database; clock: Clock; storage: StoragePort; logger: Logger }): Maintenance {
  return {
    drainStorageDeletions: () =>
      drainStorageDeletions(
        { outbox: new DrizzleDeletionOutbox(deps.db), storage: deps.storage },
        { onError: (error, key) => deps.logger.warn("storage deletion failed, will retry", { storageKey: key, error }) },
      ),
    purgeExpiredGuests: () => purgeExpiredGuests(deps.db, { now: deps.clock.now(), beforeDeleteBoards: queueBoardAttachmentKeys }),
  };
}
