import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import type { Database } from "../db/client";
import type { Logger } from "../logging/logger";
import { sessionCookieConfig, type SessionCookieConfig } from "./cookie-config";
import { DISABLED_AUTH_PATHS } from "./http-guard";

export interface AuthConfig {
  db: Database;
  secret: string;
  /** Public origin; Better Auth derives it from the request when omitted. */
  baseURL?: string;
  logger: Logger;
  /** Cookie settings shared with the proxy; defaults to the non-production ones. */
  cookies?: SessionCookieConfig;
  /** Runs when a guest signs in or up to a real account, before the guest session is dropped. */
  onLinkAccount?: (link: { guestUserId: string; userId: string }) => Promise<void>;
}

const LEVELS = { debug: "debug", info: "info", warn: "warn", error: "error" } as const;

/** Better Auth logs through our redacting logger instead of the console (REQ-SEC-01). */
export function toAuthLogger(logger: Logger) {
  return {
    level: "info" as const,
    disableColors: true,
    log: (level: keyof typeof LEVELS, message: string, ...args: unknown[]) => logger[LEVELS[level]](message, { args }),
  };
}

/**
 * The only place that configures Better Auth. Tables are owned by our migrations (see schema.ts).
 * `nextCookies` must stay the last plugin so Server Actions can set the session cookie.
 */
export function createAuth(config: AuthConfig) {
  const cookies = config.cookies ?? sessionCookieConfig(undefined);
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: "pg" }),
    secret: config.secret,
    baseURL: config.baseURL,
    // Only our own origin may call the API with a session (CSRF); without a configured URL Better Auth uses the request origin.
    trustedOrigins: config.baseURL ? [config.baseURL] : [],
    advanced: {
      cookiePrefix: cookies.prefix,
      useSecureCookies: cookies.secure,
      defaultCookieAttributes: cookies.attributes,
      // Explicit so test environments (where Better Auth skips them by default) run the same checks as production.
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    logger: toAuthLogger(config.logger),
    disabledPaths: DISABLED_AUTH_PATHS,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [
      anonymous({
        // Kept on link so the sandbox can be moved first; the TTL cleanup removes the leftover row.
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await config.onLinkAccount?.({ guestUserId: anonymousUser.user.id, userId: newUser.user.id });
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
