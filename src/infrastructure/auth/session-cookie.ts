import { getSessionCookie } from "better-auth/cookies";

/**
 * Cheap, optimistic "might be signed in" check for the proxy: it only looks for the cookie and validates
 * nothing. The real session check happens in the layout guard and in every use case.
 */
export function hasSessionCookie(requestHeaders: Headers): boolean {
  return getSessionCookie(requestHeaders) !== null;
}
