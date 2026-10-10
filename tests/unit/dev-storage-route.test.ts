import { beforeEach, describe, expect, it, vi } from "vitest";

const devStorageHandler = vi.fn();
let container: { devStorageHandler: typeof devStorageHandler | null } = { devStorageHandler };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => container }));

beforeEach(() => {
  vi.resetAllMocks();
  container = { devStorageHandler };
});

describe("/api/dev-storage", () => {
  it("hands PUT and GET to the local storage adapter, which checks the signature itself", async () => {
    const route = await import("@/app/api/dev-storage/route");
    devStorageHandler.mockResolvedValue(new Response(null, { status: 204 }));
    const put = new Request("http://localhost/api/dev-storage?sig=x", { method: "PUT", body: "abc" });
    expect((await route.PUT(put)).status).toBe(204);
    expect(devStorageHandler).toHaveBeenCalledWith(put);
    const get = new Request("http://localhost/api/dev-storage?sig=x");
    await route.GET(get);
    expect(devStorageHandler).toHaveBeenLastCalledWith(get);
  });

  it("does not exist (404) unless STORAGE_DRIVER=local", async () => {
    container = { devStorageHandler: null };
    const route = await import("@/app/api/dev-storage/route");
    expect((await route.PUT(new Request("http://localhost/api/dev-storage", { method: "PUT" }))).status).toBe(404);
    expect((await route.GET(new Request("http://localhost/api/dev-storage"))).status).toBe(404);
  });
});
