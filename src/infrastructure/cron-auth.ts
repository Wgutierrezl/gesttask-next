import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Whether an `Authorization` header is `Bearer <CRON_SECRET>`, which is what Vercel Cron sends when the variable is set.
 * Both sides are hashed to a fixed length first, so the comparison is constant time whatever the lengths. With no secret
 * configured nothing is authorized: the endpoint is closed, never open.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || authorization === null) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
