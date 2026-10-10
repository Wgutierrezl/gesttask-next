import { PENDING_UPLOAD_TTL_MS } from "./attachment-policy";
import type { Clock } from "./ports/services";
import type { UnitOfWork } from "./ports/repositories";

export interface SweepResult {
  swept: number;
}

export interface SweepOptions {
  batchSize?: number;
  /** Upper bound on batches per run, so a long backlog cannot keep a serverless invocation busy forever. */
  maxBatches?: number;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;

/**
 * Cleans up uploads that were requested but never attached to a comment (REQ-ATT-06): once a pending row is older than
 * `PENDING_UPLOAD_TTL_MS` it no longer counts for quotas and cannot be linked, so its row is deleted and its storage key
 * queued for deletion in the SAME transaction (REQ-CAS-02). The drain then removes the object. Safe to run any time and
 * repeatedly; a row a user is linking at that very moment is skipped.
 */
export async function sweepPendingUploads(deps: { uow: UnitOfWork; clock: Clock }, options: SweepOptions = {}): Promise<SweepResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  const before = new Date(deps.clock.now().getTime() - PENDING_UPLOAD_TTL_MS);
  let swept = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const count = await deps.uow.run(async (tx) => {
      const keys = await tx.attachments.deleteAbandoned(before, batchSize);
      await tx.outbox.enqueue(keys);
      return keys.length;
    });
    swept += count;
    if (count < batchSize) break;
  }
  return { swept };
}
