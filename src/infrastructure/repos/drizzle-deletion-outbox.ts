import { and, eq, isNull, sql } from "drizzle-orm";
import type { StorageDeletion, StorageDeletionOutbox } from "@/application/ports/services";
import type { Database } from "../db/client";
import { storageDeletions } from "../db/schema";

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const LEASE = sql`interval '5 minutes'`;

/**
 * Outbox of object keys to delete from storage. Bind it to a transaction to enqueue atomically with the
 * row deletes (slice 6), or to the pool to claim and settle after commit.
 */
export class DrizzleDeletionOutbox implements StorageDeletionOutbox {
  private readonly maxAttempts: number;

  constructor(
    private readonly db: Database,
    options: { maxAttempts?: number } = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 10;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) throw new RangeError("maxAttempts must be a positive integer");
  }

  async enqueue(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.insert(storageDeletions).values(
      // clock_timestamp() differs per row (now() is frozen per statement), so queue order follows `keys`.
      keys.map((storageKey) => ({ storageKey, createdAt: sql`clock_timestamp()` })),
    );
  }

  /**
   * Leases up to `limit` due rows in one statement: SKIP LOCKED keeps concurrent processors from sharing
   * rows, and the lease hides a row from others until it is settled or the lease expires (crashed worker).
   */
  async claim(limit: number): Promise<StorageDeletion[]> {
    // Workers that keep crashing never report a failure: park such rows once their last lease has lapsed.
    await this.db.execute(sql`
      UPDATE storage_deletions SET dead_at = now()
      WHERE dead_at IS NULL AND attempts >= ${this.maxAttempts} AND next_attempt_at <= now()`);
    const result = await this.db.execute<{ id: string; storage_key: string; attempts: number; created_at: string }>(sql`
      UPDATE storage_deletions SET attempts = attempts + 1, next_attempt_at = now() + ${LEASE}
      WHERE id IN (
        SELECT id FROM storage_deletions WHERE dead_at IS NULL AND next_attempt_at <= now()
        ORDER BY created_at, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING id, storage_key, attempts, created_at::text AS created_at`);
    // RETURNING has no guaranteed order: hand rows back oldest first (same-session text timestamps sort correctly).
    return result.rows
      .sort((a, b) => compareText(a.created_at, b.created_at) || compareText(a.id, b.id))
      .map((r) => ({ id: r.id, storageKey: r.storage_key, attempts: r.attempts }));
  }

  /** Only the current lease holder (same `attempts`) can delete the row. */
  async complete(claimed: StorageDeletion): Promise<boolean> {
    const removed = await this.db
      .delete(storageDeletions)
      .where(this.owned(claimed))
      .returning({ id: storageDeletions.id });
    return removed.length === 1;
  }

  /** Keeps the row for another try once the backoff (grows with the attempts) has passed, or parks it. */
  async fail(claimed: StorageDeletion): Promise<boolean> {
    const updated = await this.db
      .update(storageDeletions)
      .set(
        claimed.attempts >= this.maxAttempts
          ? { deadAt: sql`now()` }
          : { nextAttemptAt: sql`now() + least(${storageDeletions.attempts}, 10) * interval '1 minute'` },
      )
      .where(this.owned(claimed))
      .returning({ id: storageDeletions.id });
    return updated.length === 1;
  }

  private owned(claimed: StorageDeletion) {
    return and(eq(storageDeletions.id, claimed.id), eq(storageDeletions.attempts, claimed.attempts), isNull(storageDeletions.deadAt));
  }
}
