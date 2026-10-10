import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageError } from "@/domain/errors";
import { S3Storage } from "@/infrastructure/storage/s3.adapter";

const options = { bucket: "b", region: "us-east-1", accessKeyId: "id", secretAccessKey: "secret", endpoint: "http://localhost:9000" };
afterEach(() => vi.restoreAllMocks());

const respond = (...results: unknown[]) => {
  const send = vi.spyOn(S3Client.prototype, "send");
  for (const result of results) {
    send.mockImplementationOnce((async () => {
      if (result instanceof Error) throw result;
      return result;
    }) as never);
  }
  return send;
};

describe("S3Storage", () => {
  it("fails a delete when S3 reports a per-key error, even though the request itself succeeded", async () => {
    respond({ Errors: [{ Key: "boards/b/a1", Code: "AccessDenied" }] });
    await expect(new S3Storage(options).delete(["boards/b/a1"])).rejects.toBeInstanceOf(StorageError);
  });

  it("deletes in batches of 1000 keys", async () => {
    const send = respond({}, {}, {});
    await new S3Storage(options).delete(Array.from({ length: 2500 }, (_, i) => `k${i}`));
    expect(send).toHaveBeenCalledTimes(3);
    const sizes = send.mock.calls.map(([command]) => (command as { input: { Delete: { Objects: unknown[] } } }).input.Delete.Objects.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it("treats a missing object as null and any other failure as StorageError", async () => {
    respond(Object.assign(new Error("nope"), { name: "NotFound" }), Object.assign(new Error("denied for bucket b"), { name: "Forbidden" }));
    const storage = new S3Storage(options);
    expect(await storage.head("boards/b/gone")).toBeNull();
    const failure = await storage.head("boards/b/denied").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StorageError);
    expect((failure as StorageError).message).not.toContain("bucket");
  });

  it("signs a download URL that expires as asked and forces a download", async () => {
    const url = new URL(await new S3Storage(options).getDownloadUrl("boards/b/a1", 300));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toBe("attachment");
    expect(url.pathname).toBe("/b/boards/b/a1");
  });

  it("issues a POST ticket that pins the size range and the content type", async () => {
    const ticket = await new S3Storage(options).prepareUpload({ key: "boards/b/a1", contentType: "image/png", size: 1234 });
    if (ticket.kind !== "s3-post") throw new Error("s3-post ticket expected");
    const policy = JSON.parse(Buffer.from(ticket.fields.Policy!, "base64").toString("utf8")) as { conditions: unknown[] };
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 1234]);
    expect(policy.conditions).toContainEqual(["eq", "$Content-Type", "image/png"]);
    expect(ticket.fields["Content-Type"]).toBe("image/png");
  });
});
