import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobPut = vi.fn();
vi.mock("@vercel/blob/client", () => ({ put: blobPut }));

const { uploadFile, UploadError } = await import("@/components/comments/upload-strategy");

const fetchMock = vi.fn();
const file = new File([new Uint8Array([1, 2, 3])], "pixel.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("uploadFile", () => {
  it("s3-post: sends the signed fields first and the file last, straight to the bucket", async () => {
    await uploadFile({ kind: "s3-post", url: "https://bucket.example/", fields: { key: "k", Policy: "p", "X-Amz-Signature": "s" } }, file);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://bucket.example/");
    expect(init.method).toBe("POST");
    const entries = [...(init.body as FormData).entries()];
    expect(entries.map(([name]) => name)).toEqual(["key", "Policy", "X-Amz-Signature", "file"]);
    expect(entries.at(-1)![1]).toBeInstanceOf(File);
  });

  it("local-put: PUTs the bytes with the file's content type", async () => {
    await uploadFile({ kind: "local-put", url: "http://localhost:3000/api/dev-storage?sig=x" }, file);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/dev-storage?sig=x");
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/png" }, body: file });
  });

  it("blob-token: uploads privately with the client token for the pathname the server chose", async () => {
    blobPut.mockResolvedValue({});
    await uploadFile({ kind: "blob-token", clientToken: "tok", pathname: "boards/b/attachments/a" }, file);
    expect(blobPut).toHaveBeenCalledWith("boards/b/attachments/a", file, { access: "private", token: "tok", contentType: "image/png" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["s3-post", { kind: "s3-post", url: "https://bucket.example/", fields: {} } as const],
    ["local-put", { kind: "local-put", url: "http://localhost:3000/api/dev-storage" } as const],
  ])("%s: a refusal by the storage is an UploadError, not a silent success", async (_kind, ticket) => {
    fetchMock.mockResolvedValue(new Response("<Error>EntityTooLarge</Error>", { status: 400 }));
    await expect(uploadFile(ticket, file)).rejects.toBeInstanceOf(UploadError);
  });

  it("blob-token: a failure of the SDK is an UploadError", async () => {
    blobPut.mockRejectedValue(new Error("token expired"));
    await expect(uploadFile({ kind: "blob-token", clientToken: "tok", pathname: "p" }, file)).rejects.toBeInstanceOf(UploadError);
  });

  it("a network failure is an UploadError that does not echo the URL", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed for https://bucket.example/?X-Amz-Signature=secret"));
    const error = await uploadFile({ kind: "s3-post", url: "https://bucket.example/", fields: {} }, file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as Error).message).not.toContain("Signature");
  });
});
