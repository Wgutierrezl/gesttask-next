import type { StorageDeletion, StorageDeletionOutbox, StoragePort } from "./ports/services";

export interface DrainResult {
  deleted: number;
  failed: number;
}

export interface DrainOptions {
  batchSize?: number;
  /** Upper bound on batches per run, so a long queue cannot keep a serverless invocation busy forever. */
  maxBatches?: number;
  /** Called once per key that could not be deleted. The row stays queued; callers log it (without URLs or secrets). */
  onError?: (error: unknown, key: string) => void;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;

/**
 * The outbox worker (REQ-CAS-02): deletes, from the storage, the objects whose rows are already gone. A key leaves the
 * queue only once the storage confirmed its deletion; a failure keeps the row (with backoff, then dead-letter) and is
 * reported, never swallowed. Deleting an object that does not exist is a success, so re-running is always safe.
 * Rows are leased: a worker that lost its lease neither counts nor settles them.
 */
export async function drainStorageDeletions(
  deps: { outbox: StorageDeletionOutbox; storage: StoragePort },
  options: DrainOptions = {},
): Promise<DrainResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  const result: DrainResult = { deleted: 0, failed: 0 };

  const settle = async (row: StorageDeletion, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      options.onError?.(error, row.storageKey);
      if (await deps.outbox.fail(row)) result.failed += 1;
      return;
    }
    if (await deps.outbox.complete(row)) result.deleted += 1;
  };

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await deps.outbox.claim(batchSize);
    if (rows.length === 0) break;
    try {
      await deps.storage.delete(rows.map((row) => row.storageKey));
      for (const row of rows) if (await deps.outbox.complete(row)) result.deleted += 1;
    } catch {
      // One bad key must not hold the others back: retry the batch key by key so only the culprit stays queued.
      for (const row of rows) await settle(row, () => deps.storage.delete([row.storageKey]));
    }
  }
  return result;
}
