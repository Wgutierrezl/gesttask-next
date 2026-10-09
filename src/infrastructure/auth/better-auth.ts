import { sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { MIN_PASSWORD_LENGTH } from "@/application/auth-policy";
import type { Database } from "../db/client";
import type { Logger } from "../logging/logger";
import { GUEST_TTL_MS } from "./guest-ttl";
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
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
    databaseHooks: {
      session: {
        create: {
          // A guest session never outlives the sandbox it opens: the TTL counts from the guest's creation.
          before: async (session) => {
            const { rows } = await config.db.execute<{ is_anonymous: boolean; created_at: Date }>(
              sql`SELECT is_anonymous, created_at FROM "user" WHERE id = ${session.userId}`,
            );
            const guest = rows[0];
            if (!guest?.is_anonymous) return;
            const limit = new Date(new Date(guest.created_at).getTime() + GUEST_TTL_MS);
            return session.expiresAt > limit ? { data: { ...session, expiresAt: limit } } : undefined;
          },
        },
      },
    },
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
