import { createHmac } from "node:crypto";

export interface ClientKeyOptions {
  /** True when running on Vercel (`VERCEL` env set): its edge sets the client address headers. */
  vercel: boolean;
  /** How many reverse proxies of ours append to `x-forwarded-for`; 0 means the header is never trusted. */
  trustedProxyHops: number;
  production: boolean;
}

/** Thrown in production when no trustworthy client address exists: a shared bucket would let one caller lock out everyone. */
export class ClientAddressUnavailableError extends Error {
  constructor() {
    super("Cannot determine the client address: deploy on Vercel or set TRUSTED_PROXY_HOPS to the number of trusted reverse proxies");
    this.name = "ClientAddressUnavailableError";
  }
}

function forwardedAddress(requestHeaders: Headers, options: ClientKeyOptions): string | undefined {
  if (options.vercel) {
    return requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || undefined;
  }
  if (options.trustedProxyHops < 1) return undefined;
  // Each trusted proxy appends the address it saw, so the client is `hops` entries from the right; anything
  // to its left was supplied by the client and is ignored.
  const chain = (requestHeaders.get("x-forwarded-for") ?? "").split(",").map((entry) => entry.trim());
  return chain.length >= options.trustedProxyHops ? chain[chain.length - options.trustedProxyHops] || undefined : undefined;
}

/**
 * Rate-limit key for an unauthenticated caller: a keyed hash of the client address (raw IPs never reach the
 * database or the logs). The key is a domain-separated subkey of the auth secret, so the same secret never
 * signs two different things. Without a trustworthy address it fails closed in production and uses one
 * local bucket in development and tests.
 */
export function clientKeyFrom(requestHeaders: Headers, secret: string, options: ClientKeyOptions): string {
  const address = forwardedAddress(requestHeaders, options) ?? (options.production ? undefined : "local");
  if (address === undefined) throw new ClientAddressUnavailableError();
  const subkey = createHmac("sha256", secret).update("gesttask:rate-limit-client-key:v1").digest();
  return createHmac("sha256", subkey).update(address).digest("hex").slice(0, 32);
}
