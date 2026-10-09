import { describe, expect, it } from "vitest";
import { ValidationError } from "@/domain/errors";
import type { Database } from "@/infrastructure/db/client";
import { PgRateLimiter } from "@/infrastructure/ratelimit/pg-rate-limiter";

// Validation runs before any query, so a database that explodes on use proves nothing was sent.
const exploding = new Proxy({}, { get: () => { throw new Error("database must not be touched"); } }) as Database;
const limiter = new PgRateLimiter(exploding, { now: () => new Date("2026-10-09T12:00:00Z") });

describe("PgRateLimiter rule validation", () => {
  it.each([0, -60, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects windowSeconds %s", async (windowSeconds) => {
    await expect(limiter.hit("k", { limit: 5, windowSeconds })).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects limit %s", async (limit) => {
    await expect(limiter.hit("k", { limit, windowSeconds: 60 })).rejects.toBeInstanceOf(ValidationError);
  });
});
