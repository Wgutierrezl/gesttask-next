import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { Actor } from "@/application/actor";
import type { SessionPort } from "@/application/ports/services";
import { makeSignInEmail } from "@/application/use-cases/auth/sign-in-email";
import { makeSignInGuest } from "@/application/use-cases/auth/sign-in-guest";
import { makeSignOut } from "@/application/use-cases/auth/sign-out";
import { makeSignUp } from "@/application/use-cases/auth/sign-up";
import { BetterAuthPort } from "./auth/auth-port";
import { createAuth } from "./auth/better-auth";
import { clientKeyFrom } from "./auth/client-key";
import { guardAuthHandler } from "./auth/http-guard";
import { SeededGuestSandbox } from "./auth/guest-sandbox";
import { BetterAuthSession } from "./auth/session";
import { transferGuestData } from "./auth/transfer-guest";
import { getEnv } from "./config/env";
import { createDb } from "./db/client";
import { createLogger, type Logger } from "./logging/logger";
import { PgRateLimiter } from "./ratelimit/pg-rate-limiter";
import { DrizzleUnitOfWork } from "./repos/drizzle-unit-of-work";

/** Authentication flows as the web layer sees them: callers pass only form input, never ids, headers or tokens. */
export interface AuthFacade {
  signInGuest(): Promise<Actor>;
  signInEmail(input: unknown): Promise<Actor>;
  signUp(input: unknown): Promise<Actor>;
  signOut(): Promise<void>;
}

export interface Container {
  logger: Logger;
  session: SessionPort;
  auth: AuthFacade;
  /** Serves `/api/auth/*` (session read and sign-out only); credential and guest flows go through `auth`. */
  authHandler: (request: Request) => Promise<Response>;
  close(): Promise<void>;
}

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
    onLinkAccount: ({ guestUserId, userId }) => transferGuestData(db, guestUserId, userId),
  });
  const session = new BetterAuthSession(auth, () => headers());
  const authPort = new BetterAuthPort(auth, () => headers());
  const limiter = new PgRateLimiter(db, clock);
  const sandbox = new SeededGuestSandbox(db, { uow: new DrizzleUnitOfWork(db), ids: { next: randomUUID }, clock });
  const caller = async () => ({ clientKey: clientKeyFrom(await headers(), env.BETTER_AUTH_SECRET) });

  const signInGuest = makeSignInGuest({ auth: authPort, session, sandbox, limiter });
  const signInEmail = makeSignInEmail({ auth: authPort, limiter });
  const signUp = makeSignUp({ auth: authPort, limiter });
  const signOut = makeSignOut({ auth: authPort });
  return {
    logger,
    session,
    auth: {
      signInGuest: async () => signInGuest(await caller()),
      signInEmail: async (input) => signInEmail(await caller(), input),
      signUp: async (input) => signUp(await caller(), input),
      signOut: () => signOut(),
    },
    authHandler: guardAuthHandler((request) => auth.handler(request)),
    close,
  };
}

const globalForContainer = globalThis as unknown as { __gesttask?: Container };

/** Composition root: built lazily on first use (so `next build` needs no secrets) and shared across hot reloads. */
export function getContainer(): Container {
  return (globalForContainer.__gesttask ??= buildContainer());
}
