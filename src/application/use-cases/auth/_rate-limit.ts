import { RateLimitError } from "@/domain/errors";
import type { RateLimiter } from "../../ports/services";

export interface Rule {
  limit: number;
  windowSeconds: number;
}

/** Counts this attempt and throws `RateLimitError` (HTTP 429 + Retry-After) once the rule is exceeded. */
export async function enforceRateLimit(limiter: RateLimiter, key: string, rule: Rule): Promise<void> {
  const decision = await limiter.hit(key, rule);
  if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds);
}
