import { createHmac } from "node:crypto";

/**
 * Rate-limit key for an unauthenticated caller: a keyed hash of the client address, so raw IPs never reach
 * the database or the logs. Behind Vercel the first `x-forwarded-for` entry is the client; without a proxy
 * header every caller shares the "unknown" bucket (fails closed for abuse, never leaks).
 */
export function clientKeyFrom(requestHeaders: Headers, secret: string): string {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", secret).update(address).digest("hex").slice(0, 32);
}
