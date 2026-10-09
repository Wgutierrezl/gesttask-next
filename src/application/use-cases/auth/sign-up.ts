import type { Actor } from "../../actor";
import type { AuthPort, RateLimiter } from "../../ports/services";
import { parseInput } from "../../schemas/parse";
import { signUpSchema } from "../../schemas/auth";
import type { AnonymousCaller } from "./_context";
import { enforceRateLimit } from "./_rate-limit";

export const SIGN_UP_RULE = { limit: 10, windowSeconds: 3600 };

export function makeSignUp(deps: { auth: AuthPort; limiter: RateLimiter }) {
  return async (caller: AnonymousCaller, input: unknown): Promise<Actor> => {
    const data = parseInput(signUpSchema, input);
    await enforceRateLimit(deps.limiter, `sign-up:${caller.clientKey}`, SIGN_UP_RULE);
    return deps.auth.signUp(data);
  };
}
