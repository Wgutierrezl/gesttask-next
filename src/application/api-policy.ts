import type { Rule } from "./use-cases/auth/_rate-limit";

/**
 * Per-client ceilings on the REST API, on top of the limits some use cases carry themselves (uploads, sign-in). Reads
 * are cheap and the Kanban polls; writes are what an abusive script would hammer.
 */
export const API_RATE_READ: Rule = { limit: 600, windowSeconds: 60 };
export const API_RATE_WRITE: Rule = { limit: 120, windowSeconds: 60 };

export type ApiRateKind = "read" | "write";
