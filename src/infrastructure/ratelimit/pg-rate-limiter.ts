import { lt, sql } from "drizzle-orm";
import { ValidationError } from "@/domain/errors";
import type { Clock, RateLimitDecision, RateLimiter } from "@/application/ports/services";
import type { Database } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Fixed-window limiter backed by one atomic upsert per hit, so concurrent serverless instances agree.
 * Rejected hits still count (the window total keeps growing), which is harmless and keeps the query single.
 */
export class PgRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async hit(key: string, rule: { limit: number; windowSeconds: number }): Promise<RateLimitDecision> {
    if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds <= 0) {
      throw new ValidationError("Rate limit window must be a positive integer number of seconds");
    }
    if (!Number.isInteger(rule.limit) || rule.limit < 0) {
      throw new ValidationError("Rate limit must be a non-negative integer");
    }
    const now = this.clock.now().getTime();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const result = await this.db.execute<{ count: number }>(sql`
      INSERT INTO ${rateLimits} (key, window_start, count)
      VALUES (${key}, ${new Date(windowStart).toISOString()}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = ${rateLimits.count} + 1
      RETURNING count`);
    const count = result.rows[0]?.count ?? 1;
    if (count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  }

  /** Housekeeping for the cron job (slice 9): windows that started before `cutoff` can no longer matter. */
  async purgeStartedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).returning({ key: rateLimits.key });
    return deleted.length;
  }
}
