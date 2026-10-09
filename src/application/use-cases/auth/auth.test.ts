import { describe, expect, it } from "vitest";
import { ConflictError, RateLimitError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import type { Actor } from "@/application/actor";
import type { AuthPort, GuestSandbox, SessionPort } from "@/application/ports/services";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { makeSignInEmail } from "./sign-in-email";
import { makeSignInGuest } from "./sign-in-guest";
import { makeSignOut } from "./sign-out";
import { makeSignUp } from "./sign-up";
import { requireActor, withActor } from "../../require-actor";

const CALLER = { clientKey: "ip-1" };
const clock = { now: () => new Date("2026-10-09T12:00:00Z") };

function setup(current: Actor | null = null) {
  const calls: string[] = [];
  let session = current;
  const auth: AuthPort = {
    async signInGuest() { calls.push("guest"); session = { userId: `guest-${calls.length}`, isGuest: true }; return session; },
    async signInWithEmail() { calls.push("email"); return { userId: "u1", isGuest: false }; },
    async signUp() { calls.push("signup"); return { userId: "u2", isGuest: false }; },
    async signOut() { calls.push("signout"); session = null; },
  };
  const sessionPort: SessionPort = { getActor: async () => session };
  const sandbox: GuestSandbox & { provisioned: string[]; boards: Set<string> } = {
    provisioned: [],
    boards: new Set<string>(),
    async hasBoards(actor) { return this.boards.has(actor.userId); },
    async provision(actor) { this.provisioned.push(actor.userId); this.boards.add(actor.userId); },
  };
  const limiter = new InMemoryRateLimiter(clock);
  return { calls, auth, session: sessionPort, sandbox, limiter, deps: { auth, session: sessionPort, sandbox, limiter } };
}

describe("signInGuest", () => {
  it("creates a guest and provisions its sandbox", async () => {
    const s = setup();
    const actor = await makeSignInGuest(s.deps)(CALLER);
    expect(actor).toEqual({ userId: "guest-1", isGuest: true });
    expect(s.sandbox.provisioned).toEqual(["guest-1"]);
  });

  it("reuses the existing guest session and its boards: no new user, no second sandbox, no rate-limit hit", async () => {
    const s = setup({ userId: "guest-0", isGuest: true });
    s.sandbox.boards.add("guest-0");
    const signIn = makeSignInGuest(s.deps);
    for (let i = 0; i < 20; i++) expect((await signIn(CALLER)).userId).toBe("guest-0");
    expect(s.calls).toEqual([]);
    expect(s.sandbox.provisioned).toEqual([]);
  });

  it("re-provisions a guest that owns no boards, charging the guest rate limit before touching anything", async () => {
    const s = setup({ userId: "guest-0", isGuest: true });
    const signIn = makeSignInGuest(s.deps);
    await signIn(CALLER);
    expect(s.sandbox.provisioned).toEqual(["guest-0"]);
    for (let i = 0; i < 4; i++) {
      s.sandbox.boards.clear(); // the guest deleted its sandbox
      await signIn(CALLER);
    }
    s.sandbox.boards.clear();
    s.sandbox.provisioned.length = 0;
    const failure = await signIn(CALLER).catch((e) => e);
    expect(failure).toBeInstanceOf(RateLimitError);
    expect(s.sandbox.provisioned).toEqual([]);
  });

  it("refuses a signed-in real user", async () => {
    const s = setup({ userId: "u1", isGuest: false });
    await expect(makeSignInGuest(s.deps)(CALLER)).rejects.toBeInstanceOf(ConflictError);
    expect(s.calls).toEqual([]);
  });

  it("allows 5 guest logins per client per hour and answers the 6th with 429 before creating any user", async () => {
    const s = setup();
    const signIn = makeSignInGuest(s.deps);
    for (let i = 0; i < 5; i++) {
      s.sandbox.provisioned.length = 0;
      await signIn(CALLER);
      await s.auth.signOut(); // a fresh browser each time
    }
    s.calls.length = 0;
    const failure = await signIn(CALLER).catch((e) => e);
    expect(failure).toBeInstanceOf(RateLimitError);
    expect(failure.retryAfterSeconds).toBe(3600);
    expect(s.calls).toEqual([]);
    await expect(makeSignInGuest(s.deps)({ clientKey: "ip-2" })).resolves.toBeDefined();
  });
});

describe("signInEmail", () => {
  it("validates input, then signs in", async () => {
    const s = setup();
    const signIn = makeSignInEmail(s.deps);
    await expect(signIn(CALLER, { email: "nope", password: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(signIn(CALLER, { email: " Ada@Example.com ", password: "password1" })).resolves.toEqual({ userId: "u1", isGuest: false });
  });

  it("limits attempts to 10 per 15 minutes per client and email, counting wrong ones too", async () => {
    const s = setup();
    const signIn = makeSignInEmail(s.deps);
    for (let i = 0; i < 10; i++) await signIn(CALLER, { email: "a@b.co", password: "pw" });
    await expect(signIn(CALLER, { email: "A@b.co", password: "pw" })).rejects.toMatchObject({ retryAfterSeconds: 900 });
    await expect(signIn(CALLER, { email: "other@b.co", password: "pw" })).resolves.toBeDefined();
    expect(s.calls.length).toBe(11);
  });
});

describe("signInEmail per-email limit", () => {
  it("also caps attempts on one email at 50 per hour across clients, without burning it for blocked callers", async () => {
    const s = setup();
    const signIn = makeSignInEmail(s.deps);
    for (let i = 0; i < 50; i++) await signIn({ clientKey: `ip-${Math.floor(i / 5)}` }, { email: "victim@b.co", password: "pw" });
    await expect(signIn({ clientKey: "ip-new" }, { email: "VICTIM@b.co", password: "pw" })).rejects.toMatchObject({
      retryAfterSeconds: 3600,
    });
    await expect(signIn({ clientKey: "ip-new" }, { email: "other@b.co", password: "pw" })).resolves.toBeDefined();
    expect(s.calls.length).toBe(51);
  });

  it("does not count attempts already refused by the client+email limit", async () => {
    const s = setup();
    const signIn = makeSignInEmail(s.deps);
    for (let i = 0; i < 10; i++) await signIn(CALLER, { email: "v@b.co", password: "pw" });
    for (let i = 0; i < 100; i++) await signIn(CALLER, { email: "v@b.co", password: "pw" }).catch(() => undefined);
    await expect(signIn({ clientKey: "ip-2" }, { email: "v@b.co", password: "pw" })).resolves.toBeDefined();
  });
});

describe("signUp", () => {
  it("validates the password length and name", async () => {
    const s = setup();
    const signUp = makeSignUp(s.deps);
    const error = await signUp(CALLER, { email: "a@b.co", password: "short", name: "" }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["name", "password"]);
    await expect(signUp(CALLER, { email: "a@b.co", password: "long-enough", name: "Ada" })).resolves.toEqual({ userId: "u2", isGuest: false });
  });

  it("requires at least 10 characters and rejects reserved .invalid emails", async () => {
    const s = setup();
    const signUp = makeSignUp(s.deps);
    const nine = await signUp(CALLER, { email: "a@b.co", password: "123456789", name: "A" }).catch((e) => e);
    expect(nine).toBeInstanceOf(ValidationError);
    expect(Object.keys(nine.fieldErrors)).toEqual(["password"]);
    await expect(signUp(CALLER, { email: "a@b.co", password: "1234567890", name: "A" })).resolves.toBeDefined();
    for (const email of ["x@demo.invalid", "x@Example.INVALID", "x@sub.host.invalid"]) {
      const error = await signUp(CALLER, { email, password: "long-enough", name: "A" }).catch((e) => e);
      expect(error, email).toBeInstanceOf(ValidationError);
      expect(Object.keys(error.fieldErrors), email).toEqual(["email"]);
    }
    await expect(signUp(CALLER, { email: "x@invalid.com", password: "long-enough", name: "A" })).resolves.toBeDefined();
  });

  it("limits registrations to 10 per hour per client", async () => {
    const s = setup();
    const signUp = makeSignUp(s.deps);
    for (let i = 0; i < 10; i++) await signUp(CALLER, { email: `u${i}@b.co`, password: "long-enough", name: "A" });
    await expect(signUp(CALLER, { email: "x@b.co", password: "long-enough", name: "A" })).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("signOut and requireActor", () => {
  it("signs out through the port", async () => {
    const s = setup({ userId: "u1", isGuest: false });
    await makeSignOut(s.deps)();
    expect(await s.session.getActor()).toBeNull();
  });

  it("requireActor throws Unauthenticated without a session and returns the actor with one", async () => {
    await expect(requireActor(setup().session)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(requireActor(setup({ userId: "u1", isGuest: false }).session)).resolves.toEqual({ userId: "u1", isGuest: false });
  });

  it("withActor runs the use case as the session actor, or fails before running it", async () => {
    const run = async (actor: Actor, input: unknown) => ({ actor, input });
    expect(await withActor(setup({ userId: "u1", isGuest: false }).session, run)("in")).toEqual({ actor: { userId: "u1", isGuest: false }, input: "in" });
    let ran = false;
    await expect(withActor(setup().session, async () => void (ran = true))("in")).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(ran).toBe(false);
  });
});
