import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const valid = {
  DB_DRIVER: "pg",
  DATABASE_URL: "postgres://gesttask:gesttask@localhost:5433/gesttask",
  STORAGE_DRIVER: "local",
  BETTER_AUTH_SECRET: "unit-test-secret-0123456789abcdef-xyz",
};

describe("buildContainer", () => {
  it("wires session and the auth handler without opening a database connection", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const container = buildContainer(valid);
    expect(typeof container.session.getActor).toBe("function");
    expect(typeof container.authHandler).toBe("function");
    expect(Object.keys(container.auth).sort()).toEqual(["signInEmail", "signInGuest", "signOut", "signUp"]);
    await container.close();
  }, 30_000); // first import transforms the whole auth library

  it("exposes the use cases only behind the session: without one they answer Unauthenticated", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const { UnauthenticatedError } = await import("@/domain/errors");
    const container = buildContainer(valid);
    expect(Object.keys(container.useCases)).toEqual(expect.arrayContaining(["createBoard", "listMyBoards", "getBoard", "addMemberByEmail", "moveTask"]));
    await expect(container.useCases.listMyBoards({})).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(container.useCases.deleteBoard({ boardId: "00000000-0000-4000-8000-00000000ffff" })).rejects.toBeInstanceOf(UnauthenticatedError);
    await container.close();
  }, 30_000);

  it("does not expose credential or guest flows on the HTTP handler", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const container = buildContainer(valid);
    const direct = new Request("http://localhost/api/auth/sign-in/anonymous", { method: "POST" });
    expect((await container.authHandler(direct)).status).toBe(404);
    await container.close();
  }, 30_000);

  it("refuses unauthenticated flows in production when no trustworthy client address is configured", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gesttask.example.com" };
    const container = buildContainer(production);
    await expect(container.auth.signInEmail({ email: "a@b.co", password: "x" })).rejects.toThrow(/TRUSTED_PROXY_HOPS/);
    await expect(container.auth.signInGuest()).rejects.toThrow(/TRUSTED_PROXY_HOPS/);
    await container.close();
  }, 30_000);

  it("fails fast on invalid configuration, naming keys but not values", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    expect(() => buildContainer({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => buildContainer({ ...valid, BETTER_AUTH_SECRET: "short" })).not.toThrow(/short/);
  });
});

describe("/api/auth route", () => {
  it("delegates GET and POST to the container's auth handler", async () => {
    vi.resetModules();
    const authHandler = vi.fn(async () => new Response("ok"));
    vi.doMock("@/infrastructure/container", () => ({ getContainer: () => ({ authHandler }) }));
    const route = await import("@/app/api/auth/[...all]/route");
    const request = new Request("http://localhost/api/auth/get-session");
    expect(await (await route.GET(request)).text()).toBe("ok");
    await route.POST(request);
    expect(authHandler).toHaveBeenCalledTimes(2);
    expect(authHandler).toHaveBeenCalledWith(request);
  });
});
