/** Session cookie settings shared by Better Auth (which writes the cookie) and the proxy (which only looks for it). */
export interface SessionCookieConfig {
  prefix: string;
  /** Adds the `Secure` attribute and the `__Secure-` name prefix; on in production. */
  secure: boolean;
  attributes: { httpOnly: true; sameSite: "lax"; path: "/" };
}

export function sessionCookieConfig(nodeEnv: string | undefined): SessionCookieConfig {
  return {
    prefix: "better-auth",
    secure: nodeEnv === "production",
    attributes: { httpOnly: true, sameSite: "lax", path: "/" },
  };
}
