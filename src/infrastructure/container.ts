import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { Actor } from "@/application/actor";
import { API_RATE_READ, API_RATE_WRITE, type ApiRateKind } from "@/application/api-policy";
import type { SessionPort } from "@/application/ports/services";
import { guardAll } from "@/application/require-actor";
import { enforceRateLimit } from "@/application/use-cases/auth/_rate-limit";
import { makeSignInEmail } from "@/application/use-cases/auth/sign-in-email";
import { makeSignInGuest } from "@/application/use-cases/auth/sign-in-guest";
import { makeSignOut } from "@/application/use-cases/auth/sign-out";
import { makeSignUp } from "@/application/use-cases/auth/sign-up";
import { DrizzleUserDirectory } from "./auth/drizzle-user-directory";
import { BetterAuthPort } from "./auth/auth-port";
import { createAuth } from "./auth/better-auth";
import { sessionCookieConfig } from "./auth/cookie-config";
import { clientKeyFrom } from "./auth/client-key";
import { guardAuthHandler } from "./auth/http-guard";
import { SeededGuestSandbox } from "./auth/guest-sandbox";
import { BetterAuthSession } from "./auth/session";
import { transferGuestData } from "./auth/transfer-guest";
import { getEnv } from "./config/env";
import { createDb } from "./db/client";
import { createLogger, type Logger } from "./logging/logger";
import { createMaintenance, type Maintenance } from "./maintenance";
import { PgRateLimiter } from "./ratelimit/pg-rate-limiter";
import { createStorage } from "./storage/factory";
import { createDrizzleRepos } from "./repos/drizzle-repos";
import { DrizzleUnitOfWork } from "./repos/drizzle-unit-of-work";
import { buildUseCases } from "./use-cases";

/** Authentication flows as the web layer sees them: callers pass only form input, never ids, headers or tokens. */
export interface AuthFacade {
  signInGuest(): Promise<Actor>;
  signInEmail(input: unknown): Promise<Actor>;
  signUp(input: unknown): Promise<Actor>;
  signOut(): Promise<void>;
}

/** Every protected use case, already bound to the session: callers pass input only and never choose the actor. */
export type GuardedUseCases = ReturnType<typeof guardUseCases>;
const guardUseCases = (session: SessionPort, registry: ReturnType<typeof buildUseCases>) => guardAll(session, registry);

export interface Container {
  logger: Logger;
  session: SessionPort;
  auth: AuthFacade;
  useCases: GuardedUseCases;
  /** Jobs without a signed-in user (storage drain, guest purge). Only trusted entry points call them: cron and post-delete hooks. */
  maintenance: Maintenance;
  /** What the REST API (`/api/v1`) needs besides the use cases: the hosts it trusts as its own, and its per-client rate limit. */
  api: { trustedHosts: string[]; limit(kind: ApiRateKind, userId?: string): Promise<void> };
  /** Serves `/api/dev-storage` when STORAGE_DRIVER=local (signed URLs only); null for every other driver. */
  devStorageHandler: ((request: Request) => Promise<Response>) | null;
  /** Serves `/api/auth/*` (session read and sign-out only); credential and guest flows go through `auth`. */
  authHandler: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

/** The public host the app answers to when a proxy rewrites `Host` (BETTER_AUTH_URL), as CSRF checks compare it. */
function publicHosts(appUrl: string | undefined): string[] {
  try {
    return appUrl ? [new URL(appUrl).host] : [];
  } catch {
    return [];
  }
}

/** One bucket per client address for anonymous calls, per user AND address once signed in (one account cannot spend another's budget). */
const apiRateKey = (kind: ApiRateKind, clientKey: string, userId?: string) => (userId ? `api:${kind}:u:${userId}:${clientKey}` : `api:${kind}:${clientKey}`);

export function buildContainer(source: Record<string, string | undefined> = process.env): Container {
  const env = getEnv(source);
  const logger = createLogger({ level: env.NODE_ENV === "production" ? "info" : "debug" });
  const { db, close } = createDb({ driver: env.DB_DRIVER, url: env.DATABASE_URL });
  const clock = { now: () => new Date() };
  const auth = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    logger,
    cookies: sessionCookieConfig(env.NODE_ENV),
    onLinkAccount: ({ guestUserId, userId }) => transferGuestData(db, guestUserId, userId, logger),
  });
  const session = new BetterAuthSession(auth, () => headers());
  const authPort = new BetterAuthPort(auth, () => headers());
  const limiter = new PgRateLimiter(db, clock);
  const uow = new DrizzleUnitOfWork(db);
  const ids = { next: randomUUID };
  const sandbox = new SeededGuestSandbox(db, { uow, ids, clock });
  const clientKeyOptions = { vercel: Boolean(env.VERCEL), trustedProxyHops: env.TRUSTED_PROXY_HOPS, production: env.NODE_ENV === "production" };
  const caller = async () => ({ clientKey: clientKeyFrom(await headers(), env.BETTER_AUTH_SECRET, clientKeyOptions) });

  const { storage, local } = createStorage(env, clock);
  // ADR 0009 allows the local driver in a production build (e2e and smoke runs off Vercel), but it is development storage.
  if (env.STORAGE_DRIVER === "local" && env.NODE_ENV === "production") {
    logger.warn("STORAGE_DRIVER=local in a production build: attachments live on this machine's disk; use s3 or blob for a real deployment");
  }

  const useCases = guardUseCases(
    session,
    buildUseCases(
      { uow, repos: createDrizzleRepos(db, false), clock, ids },
      { users: new DrizzleUserDirectory(db), limiter, clientKey: async () => (await caller()).clientKey, storage },
    ),
  );
  const signInGuest = makeSignInGuest({ auth: authPort, session, sandbox, limiter });
  const signInEmail = makeSignInEmail({ auth: authPort, limiter });
  const signUp = makeSignUp({ auth: authPort, limiter });
  const signOut = makeSignOut({ auth: authPort });
  return {
    logger,
    session,
    useCases,
    maintenance: createMaintenance({ db, clock, storage, logger }),
    auth: {
      signInGuest: async () => signInGuest(await caller()),
      signInEmail: async (input) => signInEmail(await caller(), input),
      signUp: async (input) => signUp(await caller(), input),
      signOut: () => signOut(),
    },
    api: {
      trustedHosts: publicHosts(env.BETTER_AUTH_URL),
      limit: async (kind, userId) =>
        enforceRateLimit(limiter, apiRateKey(kind, (await caller()).clientKey, userId), kind === "read" ? API_RATE_READ : API_RATE_WRITE),
    },
    devStorageHandler: local ? (request) => local.handle(request) : null,
    authHandler: guardAuthHandler((request) => auth.handler(request)),
    close,
  };
}

const globalForContainer = globalThis as unknown as { __gesttask?: Container };

/** Composition root: built lazily on first use (so `next build` needs no secrets) and shared across hot reloads. */
export function getContainer(): Container {
  return (globalForContainer.__gesttask ??= buildContainer());
}
