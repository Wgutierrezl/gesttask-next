import { describe, expect, it } from "vitest";
import { sessionCookieConfig } from "@/infrastructure/auth/cookie-config";
import { hasSessionCookie } from "@/infrastructure/auth/session-cookie";

const cookie = (value: string) => new Headers({ cookie: value });

describe("sessionCookieConfig", () => {
  it("is httpOnly, sameSite lax and secure only in production", () => {
    expect(sessionCookieConfig("production")).toEqual({
      prefix: "better-auth",
      secure: true,
      attributes: { httpOnly: true, sameSite: "lax", path: "/" },
    });
    expect(sessionCookieConfig("development").secure).toBe(false);
    expect(sessionCookieConfig(undefined).secure).toBe(false);
    expect(sessionCookieConfig("test").attributes).toEqual(sessionCookieConfig("production").attributes);
  });
});

describe("hasSessionCookie", () => {
  it("reads the cookie name the shared config produces, with and without the __Secure- prefix", () => {
    expect(hasSessionCookie(cookie("better-auth.session_token=a.b"), sessionCookieConfig("development"))).toBe(true);
    expect(hasSessionCookie(cookie("__Secure-better-auth.session_token=a.b"), sessionCookieConfig("production"))).toBe(true);
    expect(hasSessionCookie(cookie("other.session_token=a.b"), sessionCookieConfig("production"))).toBe(false);
  });

  it("honors the configured prefix", () => {
    const config = { ...sessionCookieConfig("development"), prefix: "gesttask" };
    expect(hasSessionCookie(cookie("gesttask.session_token=a.b"), config)).toBe(true);
    expect(hasSessionCookie(cookie("better-auth.session_token=a.b"), config)).toBe(false);
  });
});
