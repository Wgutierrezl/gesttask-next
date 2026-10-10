import { afterAll, describe, expect, it } from "vitest";
import type { StoragePort, UploadTicket } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";

/** How a test plays the browser against one concrete storage backend. */
export interface StorageHarness {
  storage: StoragePort;
  /** Sends `body` the way the browser does with the ticket; resolves to whether the backend accepted it. */
  upload(ticket: UploadTicket, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<boolean>;
  /** GETs a download URL (no credentials) and returns what the backend answered. */
  fetchUrl(url: string): Promise<{ status: number; body: Uint8Array; contentType: string | null }>;
  /** A storage of the same kind whose backend cannot be reached or refuses our credentials. */
  broken(): StoragePort;
  /** Lets `seconds` pass for expiry checks (fake clock or a real wait). */
  pass(seconds: number): Promise<void>;
  close?(): Promise<void>;
}

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);
let counter = 0;
const freshKey = (prefix = "boards/b1/attachments") => `${prefix}/${Date.now().toString(36)}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * REQ-STO-02: ONE suite for every adapter, so application code sees the same behavior whichever STORAGE_DRIVER runs.
 * Size and content-type limits are enforced by the BACKEND on the upload (the ticket carries them); the application
 * validates them first, so these tests prove the second line of defense.
 */
export function runStorageContract(name: string, create: () => StorageHarness): void {
  describe(`StoragePort contract: ${name}`, () => {
    const h = create();
    afterAll(() => h.close?.());

    const put = async (key: string, body: string, contentType = "text/plain") => {
      const ticket = await h.storage.prepareUpload({ key, contentType, size: body.length });
      return h.upload(ticket, bytes(body), contentType);
    };

    it("stores what a ticket allows and reports it through head", async () => {
      const key = freshKey();
      expect(await put(key, "hello world")).toBe(true);
      expect(await h.storage.head(key)).toEqual({ size: 11, contentType: "text/plain" });
    });

    it("head of an object that was never uploaded is null, not an error", async () => {
      expect(await h.storage.head(freshKey())).toBeNull();
    });

    it("rejects a body larger than the size the ticket was issued for", async () => {
      const key = freshKey();
      const ticket = await h.storage.prepareUpload({ key, contentType: "text/plain", size: 5 });
      expect(await h.upload(ticket, bytes("this is longer than five bytes"), "text/plain")).toBe(false);
      expect(await h.storage.head(key)).toBeNull();
    });

    it("rejects a content type different from the one the ticket was issued for", async () => {
      const key = freshKey();
      const ticket = await h.storage.prepareUpload({ key, contentType: "image/png", size: 4 });
      expect(await h.upload(ticket, bytes("<svg"), "image/svg+xml")).toBe(false);
      expect(await h.storage.head(key)).toBeNull();
    });

    it("serves an uploaded object through a signed URL", async () => {
      const key = freshKey();
      await put(key, "download me");
      const url = await h.storage.getDownloadUrl(key, 60);
      const response = await h.fetchUrl(url);
      expect(response.status).toBe(200);
      expect(text(response.body)).toBe("download me");
      expect(response.contentType).toBe("text/plain");
    });

    it("a signed URL stops working once its lifetime has passed", async () => {
      const key = freshKey();
      await put(key, "short lived");
      const url = await h.storage.getDownloadUrl(key, 1);
      expect((await h.fetchUrl(url)).status).toBe(200);
      await h.pass(2);
      expect((await h.fetchUrl(url)).status).toBeGreaterThanOrEqual(400);
    });

    it("signed URLs are distinct per object and do not leak another key", async () => {
      const [a, b] = [freshKey(), freshKey()];
      await put(a, "aaa");
      await put(b, "bbb");
      const [urlA, urlB] = [await h.storage.getDownloadUrl(a, 60), await h.storage.getDownloadUrl(b, 60)];
      expect(urlA).not.toBe(urlB);
      expect(text((await h.fetchUrl(urlB)).body)).toBe("bbb");
    });

    it("delete removes objects, takes many keys and ignores keys that do not exist", async () => {
      const [a, b] = [freshKey(), freshKey()];
      await put(a, "1");
      await put(b, "2");
      await h.storage.delete([a, b, freshKey()]);
      expect(await h.storage.head(a)).toBeNull();
      expect(await h.storage.head(b)).toBeNull();
    });

    it("deleting twice, or nothing at all, is idempotent", async () => {
      const key = freshKey();
      await put(key, "x");
      await h.storage.delete([key]);
      await expect(h.storage.delete([key])).resolves.toBeUndefined();
      await expect(h.storage.delete([])).resolves.toBeUndefined();
    });

    it("keys with folders and odd characters round-trip", async () => {
      const key = `${freshKey("boards/b1/attachments/deep/er")} (copy).txt`;
      await put(key, "odd");
      expect(await h.storage.head(key)).toEqual({ size: 3, contentType: "text/plain" });
      await h.storage.delete([key]);
    });

    it("surfaces backend failures as StorageError and never as an empty success", async () => {
      const broken = h.broken();
      await expect(broken.head("boards/b1/attachments/x")).rejects.toBeInstanceOf(StorageError);
      await expect(broken.delete(["boards/b1/attachments/x"])).rejects.toBeInstanceOf(StorageError);
    });

    it("errors never echo the signing secret or the key material", async () => {
      const failure = await h.broken().delete(["boards/b1/attachments/secret-key-name"]).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(StorageError);
      expect((failure as StorageError).message).not.toContain("secret-key-name");
    });
  });
}
