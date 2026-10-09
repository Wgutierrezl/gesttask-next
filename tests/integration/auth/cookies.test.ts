import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hasSessionCookie } from "@/infrastructure/auth/session-cookie";
import { sessionCookieConfig } from "@/infrastructure/auth/cookie-config";
import { connectTestDb, resetDb } from "../support/db";
import { authFixture, cookieHeader } from "../support/auth";

const handle = connectTestDb();
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const credentials = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };

describe("session cookie", () => {
  it("is Secure, HttpOnly, SameSite=Lax with the __Secure- prefix in production, and the proxy reads it", async () => {
    const cookies = sessionCookieConfig("production");
    const { auth } = authFixture(handle, { cookies });
    const response = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const set = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(set).toMatch(/^__Secure-better-auth\.session_token=/);
    expect(set).toMatch(/; Secure/i);
    expect(set).toMatch(/; HttpOnly/i);
    expect(set).toMatch(/; SameSite=Lax/i);
    expect(set).toMatch(/; Path=\//i);
    expect(hasSessionCookie(cookieHeader(response.headers), cookies)).toBe(true);
  });

  it("is not Secure outside production, and the proxy reads it as well", async () => {
    const cookies = sessionCookieConfig("development");
    const { auth } = authFixture(handle, { cookies });
    const response = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const set = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(set).toMatch(/^better-auth\.session_token=/);
    expect(set).not.toMatch(/; Secure/i);
    expect(hasSessionCookie(cookieHeader(response.headers), cookies)).toBe(true);
  });

  it("rejects cross-origin requests that carry the session", async () => {
    const { auth } = authFixture(handle);
    const signedUp = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const headers = cookieHeader(signedUp.headers);
    headers.set("content-type", "application/json");
    const signOut = (origin: string) =>
      auth.handler(new Request("http://localhost:3000/api/auth/sign-out", { method: "POST", headers: new Headers([...headers, ["origin", origin]]), body: "{}" }));
    expect((await signOut("https://evil.example")).status).toBe(403);
    expect((await signOut("http://localhost:3000")).status).toBe(200);
  });
});
