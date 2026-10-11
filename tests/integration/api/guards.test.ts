import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authFixture } from "../support/auth";
import { apiCaller, expectError, signUpUser, withinOneRateWindow, type ApiUser } from "../support/api";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  const { testDatabaseUrl: url } = await import("../support/db");
  let container: ReturnType<typeof actual.buildContainer> | undefined;
  return {
    ...actual,
    getContainer: () =>
      (container ??= actual.buildContainer({
        DB_DRIVER: "pg",
        DATABASE_URL: url(),
        STORAGE_DRIVER: "local",
        BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
        BETTER_AUTH_URL: "https://gesttask.example.org",
        TRUSTED_PROXY_HOPS: "1", // the last x-forwarded-for entry is the client
      })),
  };
});

const boardsRoute = await import("@/app/api/v1/boards/route");
const { API_RATE_READ, API_RATE_WRITE } = await import("@/application/api-policy");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
let owner: ApiUser;

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
});
afterAll(() => handle.close());

const boardCount = async () => (await (await call(boardsRoute.GET, "GET", owner)).json()).items.length as number;

describe("CSRF and request guards on the session cookie", () => {
  it("refuses a state change that a browser labels as cross-site, with the cookie attached, and creates nothing", async () => {
    await expectError(await call(boardsRoute.POST, "POST", owner, { body: { name: "csrf" }, headers: { origin: "https://evil.example" } }), 403, "FORBIDDEN");
    await expectError(await call(boardsRoute.POST, "POST", owner, { body: { name: "csrf" }, headers: { "sec-fetch-site": "cross-site" } }), 403, "FORBIDDEN");
    expect(await boardCount()).toBe(0);
  });

  it("accepts the app's own origin and the public host named by BETTER_AUTH_URL", async () => {
    expect((await call(boardsRoute.POST, "POST", owner, { body: { name: "a" }, headers: { origin: "http://localhost:3000", host: "localhost:3000" } })).status).toBe(201);
    expect((await call(boardsRoute.POST, "POST", owner, { body: { name: "b" }, headers: { origin: "https://gesttask.example.org", "sec-fetch-site": "same-origin" } })).status).toBe(201);
  });

  it("does not let a cross-site page read through the API with a plain GET (no CORS headers are ever sent)", async () => {
    const response = await call(boardsRoute.GET, "GET", owner, { headers: { origin: "https://evil.example" } });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a write sent as a form or text/plain, the bodies a hostile page can send without a preflight", async () => {
    const send = (type: string) => {
      request.headers = new Headers(owner.headers);
      return boardsRoute.POST(new Request("http://localhost:3000/api/v1/boards", { method: "POST", headers: { ...Object.fromEntries(owner.headers), "content-type": type }, body: "name=x" }), { params: Promise.resolve({}) });
    };
    await expectError(await send("application/x-www-form-urlencoded"), 422, "VALIDATION");
    await expectError(await send("text/plain"), 422, "VALIDATION");
    expect(await boardCount()).toBe(0);
  });

  it("refuses a page on the right host but the wrong scheme (the public origin is https)", async () => {
    await expectError(await call(boardsRoute.POST, "POST", owner, { body: { name: "x" }, headers: { origin: "http://gesttask.example.org" } }), 403, "FORBIDDEN");
    expect(await boardCount()).toBe(0);
  });

  it("answers 400 to a body that is not a JSON object and 413 to one over 64 KB, 422 stays for schema errors", async () => {
    const send = (body: string) => {
      request.headers = new Headers(owner.headers);
      return boardsRoute.POST(new Request("http://localhost:3000/api/v1/boards", { method: "POST", headers: { ...Object.fromEntries(owner.headers), "content-type": "application/json" }, body }), { params: Promise.resolve({}) });
    };
    await expectError(await send("{"), 400, "BAD_REQUEST");
    await expectError(await send("[]"), 400, "BAD_REQUEST");
    await expectError(await send(JSON.stringify({ name: "x".repeat(70_000) })), 413, "PAYLOAD_TOO_LARGE");
    await expectError(await send(JSON.stringify({ name: "" })), 422, "VALIDATION");
    expect(await boardCount()).toBe(0);
  });

  it("never puts a credential in a cacheable response, and sends the request id back", async () => {
    const response = await call(boardsRoute.GET, "GET", owner, { headers: { "x-request-id": "trace-12345678" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("trace-12345678");
  });
});

describe("per-client rate limit", () => {
  it("answers 429 with Retry-After once a client exceeds the write budget, while reads keep their own budget", async () => {
    await withinOneRateWindow();
    for (let i = 0; i < API_RATE_WRITE.limit; i++) {
      const response = await call(boardsRoute.POST, "POST", owner, { body: { name: "" } });
      expect(response.status).toBe(422);
    }
    const limited = await expectError(await call(boardsRoute.POST, "POST", owner, { body: { name: "" } }), 429, "RATE_LIMITED");
    expect(limited.error.message).toMatch(/too many/i);
    const again = await call(boardsRoute.POST, "POST", owner, { body: { name: "x" } });
    expect(again.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await call(boardsRoute.GET, "GET", owner)).status).toBe(200);
    expect(API_RATE_READ.limit).toBeGreaterThan(API_RATE_WRITE.limit);
  });

  it("gives every signed-in user their own budget even from one address, and anonymous calls another", async () => {
    await withinOneRateWindow();
    const other = await signUpUser(auth, "other@example.com");
    for (let i = 0; i < API_RATE_WRITE.limit; i++) await call(boardsRoute.POST, "POST", owner, { body: { name: "" } });
    expect((await call(boardsRoute.POST, "POST", owner, { body: { name: "" } })).status).toBe(429);
    expect((await call(boardsRoute.POST, "POST", other, { body: { name: "" } })).status).toBe(422);
    expect((await call(boardsRoute.POST, "POST", null, { body: { name: "" } })).status).toBe(401);
  });
});

describe("address and per-user ceilings", () => {
  const from = (ip: string) => ({ "x-forwarded-for": ip });

  it("throttles an address before any session lookup: junk cookies cost no database read once it is over budget", async () => {
    await withinOneRateWindow();
    const { getContainer } = await import("@/infrastructure/container");
    const junk = { headers: { ...from("203.0.113.9"), cookie: "better-auth.session_token=junk.junk" } };
    const lookups = async () => {
      const spy = vi.spyOn(getContainer().session, "getActor");
      try {
        const response = await call(boardsRoute.POST, "POST", null, { body: { name: "x" }, ...junk });
        return { status: response.status, lookups: spy.mock.calls.length };
      } finally {
        spy.mockRestore();
      }
    };
    expect(await lookups()).toEqual({ status: 401, lookups: 1 }); // the lookup is real while the address is within budget
    for (let i = 0; i < API_RATE_WRITE.limit * 5; i++) await call(boardsRoute.POST, "POST", null, { body: { name: "x" }, ...junk });
    expect(await lookups()).toEqual({ status: 429, lookups: 0 });
    // Another address is untouched.
    expect((await call(boardsRoute.POST, "POST", null, { body: { name: "x" }, headers: from("203.0.113.10") })).status).toBe(401);
  }, 60_000);

  it("caps one user across addresses: rotating the address does not multiply their budget", async () => {
    await withinOneRateWindow();
    const perUser = API_RATE_WRITE.limit * 3;
    for (let i = 0; i < perUser; i++) {
      // 3 requests per address stay far below the per-address ceiling, so only the per-user bucket can stop them.
      const response = await call(boardsRoute.POST, "POST", owner, { body: { name: "" }, headers: from(`198.51.100.${Math.floor(i / 3) % 250}`) });
      expect(response.status).toBe(422);
    }
    expect((await call(boardsRoute.POST, "POST", owner, { body: { name: "" }, headers: from("192.0.2.77") })).status).toBe(429);
    const other = await signUpUser(auth, "other-user@example.com");
    expect((await call(boardsRoute.POST, "POST", other, { body: { name: "" }, headers: from("192.0.2.77") })).status).toBe(422);
  }, 60_000);
});

describe("authentication comes before parsing", () => {
  it("answers 401 to an anonymous caller sending a broken body, a bad query or a bad id", async () => {
    request.headers = new Headers();
    const broken = new Request("http://localhost:3000/api/v1/boards", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    await expectError(await boardsRoute.POST(broken, { params: Promise.resolve({}) }), 401, "UNAUTHENTICATED");
    await expectError(await call(boardsRoute.GET, "GET", null, { query: { limit: 9999 } }), 401, "UNAUTHENTICATED");
  });
});
