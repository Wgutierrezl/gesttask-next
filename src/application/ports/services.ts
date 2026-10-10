import type { Actor } from "../actor";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/** Resolves the caller of the current request; null when there is no valid session. */
export interface SessionPort {
  getActor(): Promise<Actor | null>;
}

export interface AuthPort {
  signInGuest(): Promise<Actor>;
  signInWithEmail(input: { email: string; password: string }): Promise<Actor>;
  signUp(input: { email: string; password: string; name: string }): Promise<Actor>;
  signOut(): Promise<void>;
}

/** Gives a guest its own copy of the demo board. Idempotent: provisioning twice leaves one sandbox. */
export interface GuestSandbox {
  /** Whether the guest is a member of any board (a sandbox, or whatever is left of it). */
  hasBoards(guest: Actor): Promise<boolean>;
  provision(guest: Actor): Promise<void>;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  hit(key: string, rule: { limit: number; windowSeconds: number }): Promise<RateLimitDecision>;
}

export type UploadTicket =
  | { kind: "s3-post"; url: string; fields: Record<string, string> }
  | { kind: "blob-token"; clientToken: string; pathname: string }
  | { kind: "local-put"; url: string };

export interface StoragePort {
  prepareUpload(input: { key: string; contentType: string; size: number }): Promise<UploadTicket>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  getDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  /** Idempotent for missing keys; propagates real failures as StorageError. */
  delete(keys: string[]): Promise<void>;
}

export interface StorageDeletion {
  id: string;
  storageKey: string;
  /** Number of claims so far, this one included. Doubles as the lease token: see `complete` and `fail`. */
  attempts: number;
}

/**
 * Keys of stored objects whose rows are gone. Every path that deletes rows with attachments below them
 * (board, pipeline, stage, task, comment: cascades included) MUST read those storage keys and enqueue them
 * in the SAME transaction as the delete, or the objects are orphaned in storage.
 */
export interface StorageDeletionOutbox {
  enqueue(keys: string[]): Promise<void>;
  /** Leases due rows (oldest first). Rows that exhausted their attempts are dead-lettered, never returned. */
  claim(limit: number): Promise<StorageDeletion[]>;
  /**
   * Settles a claimed row. Both only act while the caller still owns the lease (the row's attempts still
   * equal the claimed ones): a worker whose lease expired and was re-claimed must not touch the row.
   * Resolve to whether the caller still owned it.
   */
  complete(claimed: StorageDeletion): Promise<boolean>;
  /** Backs off for another try, or dead-letters the row when this was its last allowed attempt. */
  fail(claimed: StorageDeletion): Promise<boolean>;
}
