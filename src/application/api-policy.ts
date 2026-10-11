import type { Rule } from "./use-cases/auth/_rate-limit";

/**
 * Per-client ceilings on the REST API, on top of the limits some use cases carry themselves (uploads, sign-in). Reads
 * are cheap and the Kanban polls; writes are what an abusive script would hammer.
 */
export const API_RATE_READ: Rule = { limit: 600, windowSeconds: 60 };
export const API_RATE_WRITE: Rule = { limit: 120, windowSeconds: 60 };

export type ApiRateKind = "read" | "write";

/** A client address is shared (an office, a mobile carrier's NAT), so its ceiling is a multiple of what one user may spend from it. */
const ADDRESS_FACTOR = 5;
/** One user across addresses: a few devices or networks are fine, rotating through addresses to multiply the budget is not. */
const USER_FACTOR = 3;

const scaled = (rule: Rule, factor: number): Rule => ({ limit: rule.limit * factor, windowSeconds: rule.windowSeconds });

export interface ApiRateCheck {
  key: string;
  rule: Rule;
}

/**
 * The buckets one API request is charged to. Without a user (before the session is known, or anonymous) only the address
 * counts, so a flood of junk cookies is throttled before it costs a session lookup. Once the user is known they are charged
 * per user+address (the base rule) and per user alone (a multiple of it).
 */
export function apiRateChecks(kind: ApiRateKind, clientKey: string, userId?: string): ApiRateCheck[] {
  const base = kind === "read" ? API_RATE_READ : API_RATE_WRITE;
  if (!userId) return [{ key: `api:${kind}:${clientKey}`, rule: scaled(base, ADDRESS_FACTOR) }];
  return [
    { key: `api:${kind}:u:${userId}:${clientKey}`, rule: base },
    { key: `api:${kind}:u:${userId}`, rule: scaled(base, USER_FACTOR) },
  ];
}
