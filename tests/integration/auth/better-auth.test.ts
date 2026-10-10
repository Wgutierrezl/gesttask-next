import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuthTables } from "better-auth/db";
import { getTableColumns, sql } from "drizzle-orm";
import { GUEST_TTL_HOURS } from "@/infrastructure/auth/guest-ttl";
import * as schema from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "../support/db";
import { authFixture, cookieHeader, sessionFor } from "../support/auth";

const handle = connectTestDb();
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const credentials = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };

describe("Better Auth on Postgres", () => {
  it("matches the library's expected tables and fields (drift guard)", () => {
    const { auth } = authFixture(handle);
    const tables = schema as unknown as Record<string, Parameters<typeof getTableColumns>[0]>;
    for (const table of Object.values(getAuthTables(auth.options))) {
      const columns = getTableColumns(tables[table.modelName]!);
      for (const [key, field] of Object.entries(table.fields)) {
        const column = columns[field.fieldName ?? key] ?? columns[key];
        expect(column, `${table.modelName}.${key}`).toBeDefined();
        if (field.required !== false && field.defaultValue === undefined) expect(column?.notNull, `${table.modelName}.${key} notNull`).toBe(true);
      }
    }
  });

  it("signs up with email and password and resolves the actor from the session cookie", async () => {
    const { auth } = authFixture(handle);
    const response = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const session = sessionFor(auth, cookieHeader(response.headers));
    expect(await session.getActor()).toEqual({ userId: response.response.user.id, isGuest: false });
  });

  it("issues an httpOnly, sameSite session cookie and never returns or stores the plain password", async () => {
    const { auth } = authFixture(handle);
    const response = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(response.response)).not.toContain(credentials.password);
    const { rows } = await handle.db.execute<{ password: string }>(sql`SELECT password FROM account`);
    expect(rows[0]?.password).toBeTruthy();
    expect(rows[0]?.password).not.toContain(credentials.password);
  });

  it("flags anonymous users as guests", async () => {
    const { auth } = authFixture(handle);
    const response = await auth.api.signInAnonymous({ returnHeaders: true });
    const actor = await sessionFor(auth, cookieHeader(response.headers)).getActor();
    expect(actor).toEqual({ userId: response.response!.user.id, isGuest: true });
  });

  it("caps a guest session at the 24 hour TTL while real sessions keep the default lifetime", async () => {
    const { auth } = authFixture(handle);
    const guest = await auth.api.signInAnonymous({ returnHeaders: true });
    const real = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const { rows } = await handle.db.execute<{ id: string; hours: number }>(sql`
      SELECT u.id, EXTRACT(EPOCH FROM (s.expires_at - u.created_at)) / 3600 AS hours
      FROM session s JOIN "user" u ON u.id = s.user_id`);
    const hoursOf = (id: string) => Number(rows.find((row) => row.id === id)?.hours);
    expect(hoursOf(guest.response!.user.id)).toBeGreaterThan(23.9);
    expect(hoursOf(guest.response!.user.id)).toBeLessThanOrEqual(GUEST_TTL_HOURS);
    expect(hoursOf(real.response.user.id)).toBeGreaterThan(24 * 6);
  });

  it("has no actor without a cookie, with a forged cookie, or after sign-out", async () => {
    const { auth } = authFixture(handle);
    expect(await sessionFor(auth, new Headers()).getActor()).toBeNull();
    expect(await sessionFor(auth, new Headers({ cookie: "better-auth.session_token=forged.value" })).getActor()).toBeNull();

    const signedUp = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    const headers = cookieHeader(signedUp.headers);
    expect(await sessionFor(auth, headers).getActor()).not.toBeNull();
    await auth.api.signOut({ headers });
    expect(await sessionFor(auth, headers).getActor()).toBeNull();
  });

  it("rejects a duplicate email and a wrong password with no hint about which account exists", async () => {
    const { auth } = authFixture(handle);
    await auth.api.signUpEmail({ body: credentials });
    await expect(auth.api.signUpEmail({ body: credentials })).rejects.toMatchObject({ statusCode: 422 });
    const wrong = await auth.api.signInEmail({ body: { email: credentials.email, password: "nope-nope-nope" } }).catch((e) => e);
    const missing = await auth.api.signInEmail({ body: { email: "ghost@example.com", password: "nope-nope-nope" } }).catch((e) => e);
    expect(wrong.statusCode).toBe(401);
    expect({ status: missing.statusCode, message: missing.message }).toEqual({ status: wrong.statusCode, message: wrong.message });
  });

  it("leaves no password, token or cookie in the logs", async () => {
    const { auth, logs } = authFixture(handle);
    const response = await auth.api.signUpEmail({ body: credentials, returnHeaders: true });
    await auth.api.signInEmail({ body: { email: credentials.email, password: "wrong-password-1" } }).catch(() => undefined);
    const token = response.response.token ?? "";
    const output = logs.join("\n");
    expect(output).toContain("Invalid password"); // Better Auth really logs through our logger
    expect(output).not.toContain(credentials.password);
    expect(output).not.toContain("wrong-password-1");
    if (token) expect(output).not.toContain(token);
    for (const cookie of response.headers.getSetCookie()) expect(output).not.toContain(cookie.split(";")[0]!.split("=")[1]!);
  });
});
