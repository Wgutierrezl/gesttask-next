import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/infrastructure/config/env";
import { createStorage } from "@/infrastructure/storage/factory";
import { BlobStorage } from "@/infrastructure/storage/blob.adapter";
import { LocalStorage } from "@/infrastructure/storage/local.adapter";
import { S3Storage } from "@/infrastructure/storage/s3.adapter";

const base = {
  DB_DRIVER: "pg",
  DATABASE_URL: "postgres://gesttask:gesttask@localhost:5433/gesttask",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-chars!!",
};
const clock = { now: () => new Date("2026-10-10T10:00:00.000Z") };

describe("createStorage (REQ-STO-01)", () => {
  it("builds the filesystem adapter for local, pointing signed URLs at the public origin", async () => {
    const { storage, local } = createStorage(parseEnv({ ...base, STORAGE_DRIVER: "local", BETTER_AUTH_URL: "http://localhost:4000" }), clock);
    expect(storage).toBeInstanceOf(LocalStorage);
    expect(local).toBe(storage);
    const ticket = await storage.prepareUpload({ key: "k", contentType: "text/plain", size: 1 });
    expect(ticket).toMatchObject({ kind: "local-put", url: expect.stringContaining("http://localhost:4000/api/dev-storage") });
  });

  it("falls back to localhost:3000 when no public origin is configured", async () => {
    const { storage } = createStorage(parseEnv({ ...base, STORAGE_DRIVER: "local" }), clock);
    expect(await storage.getDownloadUrl("k", 60)).toContain("http://localhost:3000/api/dev-storage");
  });

  it("builds the S3 adapter, which exposes no local handler", () => {
    const built = createStorage(
      parseEnv({ ...base, STORAGE_DRIVER: "s3", S3_BUCKET: "b", AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret", S3_ENDPOINT: "http://localhost:9000" }),
      clock,
    );
    expect(built.storage).toBeInstanceOf(S3Storage);
    expect(built.local).toBeNull();
  });

  it("builds the Blob adapter, which exposes no local handler", () => {
    const built = createStorage(parseEnv({ ...base, STORAGE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }), clock);
    expect(built.storage).toBeInstanceOf(BlobStorage);
    expect(built.local).toBeNull();
  });

  it("signs local URLs with a subkey derived from the auth secret, never with the secret itself", async () => {
    const { storage } = createStorage(parseEnv({ ...base, STORAGE_DRIVER: "local" }), clock);
    const url = await storage.getDownloadUrl("boards/b/missing", 60);
    const verifier = (secret: string) =>
      new LocalStorage({ rootDir: ".local-storage-factory-test", secret, baseUrl: "http://localhost:3000", clock });
    const derived = createHmac("sha256", base.BETTER_AUTH_SECRET).update("gesttask:storage-url:v1").digest("hex");
    expect((await verifier(derived).handle(new Request(url))).status).toBe(404); // signature accepted, object missing
    expect((await verifier(base.BETTER_AUTH_SECRET).handle(new Request(url))).status).toBe(403);
    const other = createStorage(parseEnv({ ...base, BETTER_AUTH_SECRET: "another-secret-with-at-least-32-chars!!", STORAGE_DRIVER: "local" }), clock);
    expect((await verifier(derived).handle(new Request(await other.storage.getDownloadUrl("boards/b/missing", 60)))).status).toBe(403);
  });
});
