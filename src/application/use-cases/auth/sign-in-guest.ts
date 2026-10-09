import { ConflictError } from "@/domain/errors";
import type { Actor } from "../../actor";
import type { AuthPort, GuestSandbox, RateLimiter, SessionPort } from "../../ports/services";
import type { AnonymousCaller } from "./_context";
import { enforceRateLimit } from "./_rate-limit";

export const GUEST_LOGIN_RULE = { limit: 5, windowSeconds: 3600 };

interface Deps {
  auth: AuthPort;
  session: SessionPort;
  sandbox: GuestSandbox;
  limiter: RateLimiter;
}

/**
 * "Try demo" (REQ-AUTH-02): an anonymous user with its own sandbox board. A visitor that already is a guest
 * keeps its boards (no new sandbox, no hit); one that owns none gets a sandbox again. Every path that
 * provisions is rate limited BEFORE any user or board is created (REQ-SEC-03).
 */
export function makeSignInGuest(deps: Deps) {
  return async (caller: AnonymousCaller): Promise<Actor> => {
    const current = await deps.session.getActor();
    if (current && !current.isGuest) throw new ConflictError("Already signed in");
    if (current && (await deps.sandbox.hasBoards(current))) return current;
    await enforceRateLimit(deps.limiter, `guest-login:${caller.clientKey}`, GUEST_LOGIN_RULE);
    const guest = current ?? (await deps.auth.signInGuest());
    await deps.sandbox.provision(guest);
    return guest;
  };
}
