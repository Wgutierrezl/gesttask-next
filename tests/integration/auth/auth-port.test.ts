import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ConflictError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import { BetterAuthPort } from "@/infrastructure/auth/auth-port";
import * as schema from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "../support/db";
import { authFixture, cookieHeader, sessionFor } from "../support/auth";

const handle = connectTestDb();
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

const ada = { email: "ada@example.com", password: "correct horse battery", name: "Ada" };

function port(headers: Headers = new Headers()) {
  const { auth } = authFixture(handle);
  return { auth, port: new BetterAuthPort(auth, async () => headers) };
}

describe("BetterAuthPort", () => {
  it("signs up a real user and rejects a duplicate email with a conflict", async () => {
    const { port: auth } = port();
    const actor = await auth.signUp(ada);
    expect(actor.isGuest).toBe(false);
    await expect(auth.signUp({ ...ada, name: "Other" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps provider validation failures to ValidationError", async () => {
    const { port: auth } = port();
    await expect(auth.signUp({ ...ada, password: "short" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("signs in with the right password and answers wrong password and unknown email identically", async () => {
    const { port: auth } = port();
    const created = await auth.signUp(ada);
    expect(await auth.signInWithEmail({ email: ada.email, password: ada.password })).toEqual(created);
    const wrong = await auth.signInWithEmail({ email: ada.email, password: "not-the-password" }).catch((e) => e);
    const missing = await auth.signInWithEmail({ email: "ghost@example.com", password: "not-the-password" }).catch((e) => e);
    expect(wrong).toBeInstanceOf(UnauthenticatedError);
    expect(missing).toBeInstanceOf(UnauthenticatedError);
    expect(missing.message).toBe(wrong.message);
  });

  it("creates an anonymous user for guests and refuses a second guest login in the same session", async () => {
    const { auth, port: first } = port();
    const guest = await first.signInGuest();
    expect(guest.isGuest).toBe(true);
    const [row] = await handle.db.select().from(schema.user).where(eq(schema.user.id, guest.userId));
    expect(row?.isAnonymous).toBe(true);

    const signedIn = await auth.api.signInAnonymous({ returnHeaders: true });
    const again = new BetterAuthPort(auth, async () => cookieHeader(signedIn.headers));
    await expect(again.signInGuest()).rejects.toBeInstanceOf(ConflictError);
  });

  it("signs out the session it is given", async () => {
    const { auth } = port();
    const signedUp = await auth.api.signUpEmail({ body: ada, returnHeaders: true });
    const headers = cookieHeader(signedUp.headers);
    await new BetterAuthPort(auth, async () => headers).signOut();
    expect(await sessionFor(auth, headers).getActor()).toBeNull();
  });
});
