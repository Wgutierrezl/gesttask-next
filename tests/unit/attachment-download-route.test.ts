import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, StorageError, UnauthenticatedError, ValidationError } from "@/domain/errors";

const getAttachmentUrl = vi.fn();
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases: { getAttachmentUrl }, logger }) }));

const { GET } = await import("@/app/api/attachments/[attachmentId]/download/route");
const SIGNED = "https://bucket.example/boards/b/attachments/a?X-Amz-Signature=abc123secret&X-Amz-Expires=300";
const call = (attachmentId = "00000000-0000-4000-8000-000000000001") =>
  GET(new Request(`http://localhost/api/attachments/${attachmentId}/download`), { params: Promise.resolve({ attachmentId }) });

beforeEach(() => {
  vi.clearAllMocks();
  getAttachmentUrl.mockReset();
});

describe("GET /api/attachments/[attachmentId]/download", () => {
  it("redirects an authorized member to the short-lived signed URL, without letting anything cache or leak it", async () => {
    getAttachmentUrl.mockResolvedValue({ url: SIGNED, fileName: "cat.png", contentType: "image/png", expiresInSeconds: 300 });
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(SIGNED);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(getAttachmentUrl).toHaveBeenCalledWith({ attachmentId: "00000000-0000-4000-8000-000000000001" });
  });

  it("logs nothing on success: a signed URL is a credential (REQ-SEC-01)", async () => {
    getAttachmentUrl.mockResolvedValue({ url: SIGNED, fileName: "cat.png", contentType: "image/png", expiresInSeconds: 300 });
    await call();
    for (const log of Object.values(logger)) expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing or foreign attachment", new NotFoundError()],
    ["a malformed id", new ValidationError("Invalid input", { attachmentId: ["Invalid UUID"] })],
    ["a forbidden one", new ForbiddenError()],
  ])("answers %s with the same bare 404 and no location", async (_label, error) => {
    getAttachmentUrl.mockRejectedValue(error);
    const response = await call("not-a-uuid");
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("answers 401 without a session and 502 when the storage cannot sign", async () => {
    getAttachmentUrl.mockRejectedValueOnce(new UnauthenticatedError());
    expect((await call()).status).toBe(401);
    getAttachmentUrl.mockRejectedValueOnce(new StorageError());
    const response = await call();
    expect(response.status).toBe(502);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers 500 for unexpected failures and logs the error redacted, never a URL", async () => {
    getAttachmentUrl.mockRejectedValue(new Error(`boom ${SIGNED}`));
    const response = await call();
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("download failed", { error: expect.any(Error) });
    expect(await response.text()).not.toContain("Signature");
  });
});
