import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { StoragePort } from "@/application/ports/services";
import { StorageError } from "@/domain/errors";
import { createSeedFiles } from "@/infrastructure/seed/seed-files";
import { LocalStorage } from "@/infrastructure/storage/local.adapter";
import { S3Storage } from "@/infrastructure/storage/s3.adapter";
import { S3_REQUIRED, s3Available, s3TestOptions } from "./s3-env";

const root = mkdtempSync(join(tmpdir(), "gesttask-seed-files-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const s3Options = s3TestOptions();
const s3Up = await s3Available(s3Options);
if (S3_REQUIRED && !s3Up) throw new Error("STORAGE_DRIVER=s3 but the S3 server is unreachable");

const local = new LocalStorage({ rootDir: root, secret: "seed-files-secret-seed-files-secret", baseUrl: "http://localhost:3000", clock: { now: () => new Date() } });
const bytes = (text: string) => new TextEncoder().encode(text);
let n = 0;
const key = () => `boards/seed-files-test/attachments/${Date.now().toString(36)}-${++n}`;

async function behavesLikeAnUploader(storage: StoragePort, files: ReturnType<typeof createSeedFiles>) {
  if (files === null) throw new Error("this driver must be supported");
  const png = key();
  await files.put(png, "image/png", Uint8Array.from([137, 80, 78, 71]));
  expect(await storage.head(png)).toEqual({ size: 4, contentType: "image/png" });
  const text = key();
  await files.put(text, "text/plain", bytes("hello seed"));
  expect(await storage.head(text)).toEqual({ size: 10, contentType: "text/plain" });
  await files.delete([png, text]);
  expect(await storage.head(png)).toBeNull();
  expect(await storage.head(text)).toBeNull();
  await files.delete([png]); // idempotent
}

describe("createSeedFiles", () => {
  it("stores and deletes objects through the local driver, exactly as the browser would", async () => {
    await behavesLikeAnUploader(local, createSeedFiles({ driver: "local", storage: local, local }));
  });

  it.skipIf(!s3Up)("stores and deletes objects through presigned POST against an S3 server (RustFS)", async () => {
    const storage = new S3Storage(s3Options);
    await behavesLikeAnUploader(storage, createSeedFiles({ driver: "s3", storage, local: null }));
  });

  it("surfaces a refused upload as a StorageError instead of pretending the object exists", async () => {
    const files = createSeedFiles({ driver: "local", storage: local, local: new LocalStorage({ rootDir: root, secret: "another-secret-another-secret-12345", baseUrl: "http://localhost:3000", clock: { now: () => new Date() } }) });
    await expect(files!.put(key(), "text/plain", bytes("x"))).rejects.toBeInstanceOf(StorageError); // signed with a different secret: 403
  });

  it("is unavailable for the Blob driver (its browser-token flow has no server-side equivalent here): null, so the seed skips attachments", () => {
    const blob = {} as StoragePort;
    expect(createSeedFiles({ driver: "blob", storage: blob, local: null })).toBeNull();
  });
});
