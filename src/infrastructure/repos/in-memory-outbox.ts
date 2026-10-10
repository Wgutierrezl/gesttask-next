import { randomUUID } from "node:crypto";
import type { StorageDeletion, StorageDeletionOutbox } from "@/application/ports/services";
import type { InMemoryStore } from "./in-memory-store";

const LEASE_MS = 5 * 60_000;
const BACKOFF_STEP_MS = 60_000;
const MAX_BACKOFF_STEPS = 10;

/**
 * Fake of the Postgres outbox with the same lease rules: claiming leases a row for five minutes, a failure backs off
 * a minute per attempt (capped at ten), a row out of attempts is parked, and only the lease holder may settle it.
 * The rows live in the store, so a fake unit of work rolls the queue back together with everything else.
 */
export class InMemoryDeletionOutbox implements StorageDeletionOutbox {
  constructor(
    private readonly store: InMemoryStore,
    private readonly now: () => Date,
    private readonly maxAttempts = 10,
  ) {}

  async enqueue(keys: string[]): Promise<void> {
    for (const storageKey of keys) {
      const id = randomUUID();
      const at = this.now().getTime();
      this.store.storageDeletions.set(id, { id, storageKey, attempts: 0, createdAt: at, nextAttemptAt: at, deadAt: null });
    }
  }

  async claim(limit: number): Promise<StorageDeletion[]> {
    const now = this.now().getTime();
    const rows = [...this.store.storageDeletions.values()];
    for (const row of rows) if (row.deadAt === null && row.attempts >= this.maxAttempts && row.nextAttemptAt <= now) row.deadAt = now;
    const due = rows.filter((row) => row.deadAt === null && row.nextAttemptAt <= now).slice(0, limit);
    for (const row of due) {
      row.attempts += 1;
      row.nextAttemptAt = now + LEASE_MS;
    }
    return due.map((row) => ({ id: row.id, storageKey: row.storageKey, attempts: row.attempts }));
  }

  async complete(claimed: StorageDeletion): Promise<boolean> {
    if (!this.owns(claimed)) return false;
    this.store.storageDeletions.delete(claimed.id);
    return true;
  }

  async fail(claimed: StorageDeletion): Promise<boolean> {
    if (!this.owns(claimed)) return false;
    const row = this.store.storageDeletions.get(claimed.id)!;
    const now = this.now().getTime();
    if (claimed.attempts >= this.maxAttempts) row.deadAt = now;
    else row.nextAttemptAt = now + Math.min(row.attempts, MAX_BACKOFF_STEPS) * BACKOFF_STEP_MS;
    return true;
  }

  private owns(claimed: StorageDeletion): boolean {
    const row = this.store.storageDeletions.get(claimed.id);
    return row !== undefined && row.attempts === claimed.attempts && row.deadAt === null;
  }
}
