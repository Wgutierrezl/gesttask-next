import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { runStorageContract, type StorageHarness } from "@tests/contract/storage.contract";
import { LocalStorage } from "@/infrastructure/storage/local.adapter";

const SECRET = "local-test-secret-local-test-secret";
const BASE_URL = "http://localhost:3000";
const roots: string[] = [];
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function makeLocal(rootDir?: string) {
  const root = rootDir ?? mkdtempSync(join(tmpdir(), "gesttask-local-"));
  roots.push(root);
  let now = new Date("2026-10-10T10:00:00.000Z");
  const storage = new LocalStorage({ rootDir: root, secret: SECRET, baseUrl: BASE_URL, clock: { now: () => now } });
  return { root, storage, advance: (seconds: number) => void (now = new Date(now.getTime() + seconds * 1000)) };
}

const put = (storage: LocalStorage, url: string, body: string, contentType = "text/plain") =>
  storage.handle(new Request(url, { method: "PUT", headers: { "content-type": contentType }, body }));

const localTicket = async (storage: LocalStorage, key: string, size: number, contentType = "text/plain") => {
  const ticket = await storage.prepareUpload({ key, contentType, size });
  if (ticket.kind !== "local-put") throw new Error("local ticket expected");
  return ticket;
};

runStorageContract("local filesystem", () => {
  const local = makeLocal();
  const harness: StorageHarness = {
    storage: local.storage,
    async upload(ticket, body, contentType) {
      if (ticket.kind !== "local-put") throw new Error("expected a local ticket");
      const response = await local.storage.handle(new Request(ticket.url, { method: "PUT", headers: { "content-type": contentType }, body: new Blob([body]) }));
      return response.status === 204;
    },
    async fetchUrl(url) {
      const response = await local.storage.handle(new Request(url));
      return { status: response.status, body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type"), disposition: response.headers.get("content-disposition") };
    },
    namesDownloads: true,
    broken: () => {
      // A storage root that sits below a regular file: every filesystem call fails with ENOTDIR.
      const file = join(local.root, "not-a-directory");
      writeFileSync(file, "x");
      return makeLocal(join(file, "nested")).storage;
    },
    pass: async (seconds) => local.advance(seconds),
  };
  return harness;
});

describe("LocalStorage", () => {
  it("a ticket works for five minutes at most (a leaked form cannot be reused for long)", async () => {
    const { storage, advance } = makeLocal();
    const early = await localTicket(storage, "boards/b/early", 10);
    const late = await localTicket(storage, "boards/b/late", 10);
    advance(299);
    expect((await put(storage, early.url, "hello")).status).toBe(204);
    advance(2);
    expect((await put(storage, late.url, "hello")).status).toBe(403);
  });

  it("rejects an oversized upload from its content-length without buffering the body", async () => {
    const { storage } = makeLocal();
    const ticket = await localTicket(storage, "boards/b/big", 10);
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const request = { method: "PUT", url: ticket.url, headers: new Headers({ "content-type": "text/plain", "content-length": "11" }), arrayBuffer, body: null };
    expect((await storage.handle(request as unknown as Request)).status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    const exact = { ...request, headers: new Headers({ "content-type": "text/plain", "content-length": "10" }), arrayBuffer: async () => new TextEncoder().encode("0123456789").buffer };
    expect((await storage.handle(exact as unknown as Request)).status).toBe(204);
  });

  it("stops reading a body that outgrows the ticket when no content-length announced it", async () => {
    const { storage } = makeLocal();
    const ticket = await localTicket(storage, "boards/b/stream", 10);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(8));
        if (pulled >= 1000) controller.close();
      },
    });
    const response = await storage.handle(new Request(ticket.url, { method: "PUT", headers: { "content-type": "text/plain" }, body, duplex: "half" } as RequestInit));
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it("serves a download under the signed name and refuses a swapped one", async () => {
    const { storage } = makeLocal();
    await put(storage, (await localTicket(storage, "boards/b/named", 5)).url, "hello");
    const url = await storage.getDownloadUrl("boards/b/named", 60, { fileName: "notes.txt" });
    expect((await storage.handle(new Request(url))).headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''notes.txt");
    expect((await storage.handle(new Request(url.replace("notes.txt", "evil.html")))).status).toBe(403);
    expect((await storage.handle(new Request(await storage.getDownloadUrl("boards/b/named", 60)))).headers.get("content-disposition")).toBe("attachment");
  });

  it("issues a PUT ticket pointing at the dev storage route", async () => {
    const { storage } = makeLocal();
    const ticket = await storage.prepareUpload({ key: "boards/b/a1", contentType: "image/png", size: 10 });
    expect(ticket).toEqual({ kind: "local-put", url: expect.stringMatching(/^http:\/\/localhost:3000\/api\/dev-storage\?/) });
  });

  it("refuses a ticket URL whose signed limits were tampered with", async () => {
    const { storage } = makeLocal();
    const ticket = await localTicket(storage, "boards/b/a1", 3);
    const response = await put(storage, ticket.url.replace("size=3", "size=3000"), "abc");
    expect(response.status).toBe(403);
  });

  it("refuses an upload ticket once it expired", async () => {
    const { storage, advance } = makeLocal();
    const ticket = await localTicket(storage, "boards/b/a1", 3);
    advance(16 * 60);
    expect((await put(storage, ticket.url, "abc")).status).toBe(403);
  });

  it("a download URL cannot be replayed as an upload", async () => {
    const { storage } = makeLocal();
    const url = await storage.getDownloadUrl("boards/b/a1", 60);
    expect((await put(storage, url, "abc")).status).toBe(403);
  });

  it("an upload ticket cannot be replayed as a download", async () => {
    const { storage } = makeLocal();
    const ticket = await localTicket(storage, "boards/b/a1", 3);
    expect((await storage.handle(new Request(ticket.url))).status).toBe(403);
  });

  it("maps hostile keys to files inside the storage root only", async () => {
    const { storage } = makeLocal();
    const ticket = await localTicket(storage, "../../escape/me", 3);
    expect((await put(storage, ticket.url, "abc")).status).toBe(204);
    expect(await storage.head("../../escape/me")).toEqual({ size: 3, contentType: "text/plain" });
    expect(await storage.head("escape/me")).toBeNull();
  });

  it("answers 404 for a download of a missing object", async () => {
    const { storage } = makeLocal();
    expect((await storage.handle(new Request(await storage.getDownloadUrl("boards/b/missing", 60)))).status).toBe(404);
  });

  it("answers 405 to other methods", async () => {
    const { storage } = makeLocal();
    expect((await storage.handle(new Request(`${BASE_URL}/api/dev-storage`, { method: "POST" }))).status).toBe(405);
  });
});
