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

  it("tells the REST API which hosts are its own and rate limits per client", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const withUrl = buildContainer({ ...valid, BETTER_AUTH_URL: "https://gesttask.example.com:8443/app" });
    expect(withUrl.api.trustedOrigins).toEqual(["https://gesttask.example.com:8443"]);
    expect(withUrl.api.forwardedProtoHops).toBe(0);
    expect(typeof withUrl.api.limit).toBe("function");
    await withUrl.close();
    const without = buildContainer(valid);
    expect(without.api.trustedOrigins).toEqual([]);
    await without.close();
    const proxied = buildContainer({ ...valid, TRUSTED_PROXY_HOPS: "1" });
    expect(proxied.api.forwardedProtoHops).toBe(1); // the proxies we trust for the address are trusted for the scheme
    await proxied.close();
    const twoProxies = buildContainer({ ...valid, TRUSTED_PROXY_HOPS: "2" });
    expect(twoProxies.api.forwardedProtoHops).toBe(2);
    await twoProxies.close();
    const vercel = buildContainer({ ...valid, VERCEL: "1", STORAGE_DRIVER: "s3", S3_BUCKET: "b", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" });
    expect(vercel.api.forwardedProtoHops).toBe(1); // the edge sets one entry
    await vercel.close();
  }, 30_000);

  it("builds the storage driver and the background jobs from the environment", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const container = buildContainer(valid);
    expect(typeof container.devStorageHandler).toBe("function"); // STORAGE_DRIVER=local
    expect(Object.keys(container.maintenance).sort()).toEqual(["drainStorageDeletions", "purgeExpiredGuests", "sweepPendingUploads"]);
    expect(Object.keys(container.useCases)).toEqual(expect.arrayContaining(["createComment", "requestUpload", "getAttachmentUrl", "deleteComment"]));
    await container.close();
    const s3 = buildContainer({
      ...valid, STORAGE_DRIVER: "s3", S3_BUCKET: "b", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(s3.devStorageHandler).toBeNull();
    await s3.close();
  }, 30_000);

  it("warns at startup when a production build runs on the local storage driver, and only then (ADR 0009)", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gesttask.example.com" };
      const warned = () => write.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"level":"warn"') && line.includes("STORAGE_DRIVER=local"));
      await buildContainer(production).close();
      expect(warned()).toHaveLength(1);
      expect(warned()[0]).not.toContain(valid.BETTER_AUTH_SECRET);
      write.mockClear();
      await buildContainer(valid).close(); // development: no warning
      await buildContainer({ ...production, STORAGE_DRIVER: "s3", S3_BUCKET: "b", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" }).close();
      expect(warned()).toEqual([]);
    } finally {
      write.mockRestore();
    }
  }, 30_000);

  it("warns at startup when production has no trustworthy client address (not on Vercel, TRUSTED_PROXY_HOPS=0), and only then", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const warned = () => write.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"level":"warn"') && line.includes("TRUSTED_PROXY_HOPS"));
      const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gesttask.example.com" };
      await buildContainer(production).close();
      expect(warned()).toHaveLength(1);
      write.mockClear();
      await buildContainer(valid).close(); // development
      await buildContainer({ ...production, TRUSTED_PROXY_HOPS: "1" }).close();
      await buildContainer({ ...production, VERCEL: "1", STORAGE_DRIVER: "s3", S3_BUCKET: "b", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret" }).close();
      expect(warned()).toEqual([]);
    } finally {
      write.mockRestore();
    }
  }, 30_000);

  it("answers the REST API limit with a clear 503-class error, not an opaque crash, when production has no client address", async () => {
    const { buildContainer } = await import("@/infrastructure/container");
    const { UnavailableError } = await import("@/domain/errors");
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const container = buildContainer({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gesttask.example.com" });
      await expect(container.api.limit("read", "user-1")).rejects.toBeInstanceOf(UnavailableError);
      const logged = write.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"level":"error"'));
      expect(logged.join("")).toMatch(/TRUSTED_PROXY_HOPS/); // the operator is told what to fix; the client is not
      await container.close();
    } finally {
      write.mockRestore();
    }
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
