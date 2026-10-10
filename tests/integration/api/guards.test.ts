import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authFixture } from "../support/auth";
import { apiCaller, expectError, signUpUser, type ApiUser } from "../support/api";
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

  it("never puts a credential in a cacheable response, and sends the request id back", async () => {
    const response = await call(boardsRoute.GET, "GET", owner, { headers: { "x-request-id": "trace-12345678" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("trace-12345678");
  });
});

describe("per-client rate limit", () => {
  it("answers 429 with Retry-After once a client exceeds the write budget, while reads keep their own budget", async () => {
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
});
