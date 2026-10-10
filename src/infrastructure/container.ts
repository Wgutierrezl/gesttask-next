import "server-only";
import { headers } from "next/headers";
import type { SessionPort } from "@/application/ports/services";
import { createAuth } from "./auth/better-auth";
import { BetterAuthSession } from "./auth/session";
import { getEnv } from "./config/env";
import { createDb } from "./db/client";
import { createLogger, type Logger } from "./logging/logger";

export interface Container {
  logger: Logger;
  session: SessionPort;
  /** Serves `/api/auth/*`; the only way the web layer reaches the auth provider. */
  authHandler: (request: Request) => Promise<Response>;
}

export function buildContainer(source: Record<string, string | undefined> = process.env): Container {
  const env = getEnv(source);
  const logger = createLogger({ level: env.NODE_ENV === "production" ? "info" : "debug" });
  const { db } = createDb({ driver: env.DB_DRIVER, url: env.DATABASE_URL });
  const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL, logger });
  return { logger, session: new BetterAuthSession(auth, () => headers()), authHandler: (request) => auth.handler(request) };
}

const globalForContainer = globalThis as unknown as { __gesttask?: Container };

/** Composition root: built lazily on first use (so `next build` needs no secrets) and shared across hot reloads. */
export function getContainer(): Container {
  return (globalForContainer.__gesttask ??= buildContainer());
}
