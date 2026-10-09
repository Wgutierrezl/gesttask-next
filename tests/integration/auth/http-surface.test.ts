import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { guardAuthHandler } from "@/infrastructure/auth/http-guard";
import { connectTestDb, resetDb } from "../support/db";
import { authFixture, cookieHeader } from "../support/auth";

const handle = connectTestDb();
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const credentials = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };
const post = (path: string, body: unknown, headers: Headers = new Headers()) => {
  headers.set("content-type", "application/json");
  headers.set("origin", "http://localhost:3000");
  return new Request(`http://localhost:3000/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
};
const userCount = async () => Number((await handle.db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM "user"`)).rows[0]?.n);

describe("/api/auth surface", () => {
  it("rejects direct credential and guest POSTs even on the raw Better Auth handler", async () => {
    const { auth } = authFixture(handle);
    for (const [path, body] of [
      ["/sign-up/email", credentials],
      ["/sign-in/anonymous", {}],
    ] as const) {
      expect((await auth.handler(post(path, body))).status, path).toBe(404);
    }
    expect(await userCount()).toBe(0);
    await auth.api.signUpEmail({ body: credentials });
    expect((await auth.handler(post("/sign-in/email", credentials))).status).toBe(404);
  });

  it("serves only get-session and sign-out through the guarded handler", async () => {
    const { auth } = authFixture(handle);
    const guarded = guardAuthHandler(auth.handler);
    expect((await guarded(post("/sign-up/email", credentials))).status).toBe(404);
    expect((await guarded(post("/sign-in/anonymous", {}))).status).toBe(404);
    expect(await userCount()).toBe(0);

    const signedUp = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const headers = cookieHeader(signedUp.headers);
    const session = await guarded(new Request("http://localhost:3000/api/auth/get-session", { headers }));
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(credentials.email);

    expect((await guarded(post("/sign-out", {}, headers))).status).toBe(200);
    const after = await guarded(new Request("http://localhost:3000/api/auth/get-session", { headers }));
    expect(await after.json()).toBeNull();
  });
});
