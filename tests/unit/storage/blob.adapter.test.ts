import { describe, expect, it } from "vitest";
import { runStorageContract } from "@tests/contract/storage.contract";
import { FakeBlobApi } from "@tests/support/fake-blob-api";
import { StorageError } from "@/domain/errors";
import { BlobStorage } from "@/infrastructure/storage/blob.adapter";

const TOKEN = "vercel_blob_rw_test_token";

runStorageContract("Vercel Blob (mocked control API)", () => {
  let now = Date.parse("2026-10-10T10:00:00.000Z");
  const api = new FakeBlobApi(TOKEN, () => now);
  const make = (token: string) => new BlobStorage({ token, api, clock: { now: () => new Date(now) } });
  return {
    storage: make(TOKEN),
    async upload(ticket, body, contentType) {
      if (ticket.kind !== "blob-token") throw new Error("expected a blob-token ticket");
      return api.clientPut(ticket.clientToken, ticket.pathname, body, contentType).then(() => true, () => false);
    },
    async fetchUrl(url) {
      return api.fetchPresigned(url);
    },
    broken: () => make("wrong-token"),
    pass: async (seconds) => void (now += seconds * 1000),
  };
});

describe("BlobStorage", () => {
  const setup = () => {
    const now = Date.parse("2026-10-10T10:00:00.000Z");
    const api = new FakeBlobApi(TOKEN, () => now);
    return { api, storage: new BlobStorage({ token: TOKEN, api, clock: { now: () => new Date(now) } }) };
  };

  it("binds the ticket to the key it was issued for", async () => {
    const { storage } = setup();
    const ticket = await storage.prepareUpload({ key: "boards/b/a1", contentType: "image/png", size: 10 });
    expect(ticket).toEqual({ kind: "blob-token", clientToken: expect.stringMatching(/^fake_client_/), pathname: "boards/b/a1" });
  });

  it("the client token stops working after five minutes", async () => {
    let now = Date.parse("2026-10-10T10:00:00.000Z");
    const api = new FakeBlobApi(TOKEN, () => now);
    const storage = new BlobStorage({ token: TOKEN, api, clock: { now: () => new Date(now) } });
    const fresh = await storage.prepareUpload({ key: "boards/b/a1", contentType: "text/plain", size: 10 });
    const stale = await storage.prepareUpload({ key: "boards/b/a2", contentType: "text/plain", size: 10 });
    if (fresh.kind !== "blob-token" || stale.kind !== "blob-token") throw new Error("blob ticket expected");
    now += 299_000;
    await expect(api.clientPut(fresh.clientToken, fresh.pathname, new Uint8Array(3), "text/plain")).resolves.not.toThrow();
    now += 2_000;
    await expect(api.clientPut(stale.clientToken, stale.pathname, new Uint8Array(3), "text/plain")).rejects.toThrow();
  });

  it("the token cannot upload to another pathname", async () => {
    const { storage, api } = setup();
    const ticket = await storage.prepareUpload({ key: "boards/b/a1", contentType: "text/plain", size: 10 });
    if (ticket.kind !== "blob-token") throw new Error("blob ticket expected");
    await expect(api.clientPut(ticket.clientToken, "boards/b/other", new Uint8Array(3), "text/plain")).rejects.toThrow();
    expect(api.objects.size).toBe(0);
  });

  it("wraps SDK failures without leaking the token or the original message", async () => {
    const { storage, api } = setup();
    api.failWith = new Error(`request failed for ${TOKEN}`);
    const failure = await storage.delete(["boards/b/a1"]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StorageError);
    expect((failure as StorageError).message).not.toContain(TOKEN);
  });

  it("asks the control API for a single read-only grant per download URL", async () => {
    const { storage, api } = setup();
    await storage.getDownloadUrl("boards/b/a1", 300);
    expect(api.calls).toEqual(["auth"]);
  });
});
