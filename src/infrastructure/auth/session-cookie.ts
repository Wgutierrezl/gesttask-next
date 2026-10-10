import { getSessionCookie } from "better-auth/cookies";
import { sessionCookieConfig, type SessionCookieConfig } from "./cookie-config";

/**
 * Cheap, optimistic "might be signed in" check for the proxy: it only looks for the cookie and validates
 * nothing. The real session check happens in the layout guard and in every use case.
 */
export function hasSessionCookie(
  requestHeaders: Headers,
  config: SessionCookieConfig = sessionCookieConfig(process.env.NODE_ENV),
): boolean {
  return getSessionCookie(requestHeaders, { cookiePrefix: config.prefix }) !== null;
}
