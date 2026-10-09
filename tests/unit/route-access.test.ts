import { describe, expect, it } from "vitest";
import { loginRedirectFor, requiresSession } from "@/app/_shared/route-access";
import { hasSessionCookie } from "@/infrastructure/auth/session-cookie";

describe("requiresSession", () => {
  it.each(["/boards", "/boards/abc", "/boards/abc/settings", "/dashboard", "/dashboard/x"])("protects %s", (path) => {
    expect(requiresSession(path)).toBe(true);
  });

  it.each(["/", "/login", "/register", "/api/auth/get-session", "/api/v1/boards", "/boardsy", "/docs", "/_next/static/x.js"])(
    "leaves %s to its own checks",
    (path) => expect(requiresSession(path)).toBe(false),
  );
});

describe("loginRedirectFor", () => {
  it("sends visitors to the login page and remembers where they were going", () => {
    expect(loginRedirectFor("/boards/abc", "?tab=members")).toBe("/login?next=%2Fboards%2Fabc%3Ftab%3Dmembers");
    expect(loginRedirectFor("/boards", "")).toBe("/login?next=%2Fboards");
  });
});

describe("hasSessionCookie", () => {
  const withCookie = (cookie: string) => new Headers({ cookie });

  it("sees the Better Auth session cookie, plain or secure-prefixed", () => {
    expect(hasSessionCookie(withCookie("better-auth.session_token=abc.def"))).toBe(true);
    expect(hasSessionCookie(withCookie("__Secure-better-auth.session_token=abc.def"))).toBe(true);
  });

  it("is false without it", () => {
    expect(hasSessionCookie(new Headers())).toBe(false);
    expect(hasSessionCookie(withCookie("theme=dark; other=1"))).toBe(false);
  });
});
