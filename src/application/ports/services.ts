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
  attempts: number;
}

export interface StorageDeletionOutbox {
  enqueue(keys: string[]): Promise<void>;
  claim(limit: number): Promise<StorageDeletion[]>;
  complete(id: string): Promise<void>;
  fail(id: string): Promise<void>;
}
