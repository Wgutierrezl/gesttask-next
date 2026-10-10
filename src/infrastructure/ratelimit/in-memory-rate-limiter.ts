import type { Clock, RateLimitDecision, RateLimiter } from "@/application/ports/services";

/** Fixed-window limiter with the same semantics as `PgRateLimiter`, for tests and single-process dev. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  async hit(key: string, rule: { limit: number; windowSeconds: number }): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const slot = `${key}@${windowStart}`;
    const count = (this.counts.get(slot) ?? 0) + 1;
    this.counts.set(slot, count);
    if (count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  }
}
