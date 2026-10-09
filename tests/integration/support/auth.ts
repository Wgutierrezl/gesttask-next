import type { DbHandle } from "@/infrastructure/db/client";
import { createAuth, type Auth } from "@/infrastructure/auth/better-auth";
import { BetterAuthSession } from "@/infrastructure/auth/session";
import { createLogger, type Logger } from "@/infrastructure/logging/logger";

export const TEST_SECRET = "integration-test-secret-0123456789abcdef";

export interface AuthFixture {
  auth: Auth;
  logger: Logger;
  /** Every JSON line the logger (and Better Auth through it) produced. */
  logs: string[];
}

export function authFixture(handle: DbHandle, extra: Partial<Parameters<typeof createAuth>[0]> = {}): AuthFixture {
  const logs: string[] = [];
  const logger = createLogger({ level: "debug", write: (line) => logs.push(line) });
  return { auth: createAuth({ db: handle.db, secret: TEST_SECRET, baseURL: "http://localhost:3000", logger, ...extra }), logger, logs };
}

/** Turns the `Set-Cookie` headers of a response into the `Cookie` header a browser would send back. */
export function cookieHeader(headers: Headers): Headers {
  const pairs = headers.getSetCookie().map((cookie) => cookie.split(";")[0]!);
  return new Headers({ cookie: pairs.join("; ") });
}

/** A SessionPort bound to a fixed set of request headers, i.e. one browser. */
export function sessionFor(auth: Auth, headers: Headers): BetterAuthSession {
  return new BetterAuthSession(auth, async () => headers);
}
