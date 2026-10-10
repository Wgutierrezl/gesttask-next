import type { Actor } from "../../actor";
import type { AuthPort, RateLimiter } from "../../ports/services";
import { parseInput } from "../../schemas/parse";
import { signInEmailSchema } from "../../schemas/auth";
import type { AnonymousCaller } from "./_context";
import { enforceRateLimit } from "./_rate-limit";

export const EMAIL_LOGIN_RULE = { limit: 10, windowSeconds: 900 };
/** Per account, whatever the client: bounds a distributed guessing attack that rotates addresses. */
export const EMAIL_ONLY_LOGIN_RULE = { limit: 50, windowSeconds: 3600 };

/** Every attempt counts, wrong ones included (an attempt refused by the client+email rule is not charged to the account); the port reports bad credentials with one generic error. */
export function makeSignInEmail(deps: { auth: AuthPort; limiter: RateLimiter }) {
  return async (caller: AnonymousCaller, input: unknown): Promise<Actor> => {
    const data = parseInput(signInEmailSchema, input);
    await enforceRateLimit(deps.limiter, `email-login:${caller.clientKey}:${data.email}`, EMAIL_LOGIN_RULE);
    await enforceRateLimit(deps.limiter, `email-login-account:${data.email}`, EMAIL_ONLY_LOGIN_RULE);
    return deps.auth.signInWithEmail(data);
  };
}
