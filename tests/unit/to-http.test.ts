import { describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, StorageError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import { toHttp } from "@/app/_shared/to-http";

describe("toHttp (REQ-API-03)", () => {
  it.each([
    [new ValidationError("Invalid input", { name: ["Required"] }), 422, "VALIDATION"],
    [new UnauthenticatedError(), 401, "UNAUTHENTICATED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError("Taken"), 409, "CONFLICT"],
    [new StorageError(), 502, "STORAGE"],
  ])("maps %s to its status with the uniform error body", (error, status, code) => {
    const response = toHttp(error, "req-1");
    expect(response.status).toBe(status);
    expect(response.body.error).toMatchObject({ code, message: error.message, requestId: "req-1" });
  });

  it("carries field errors as details and Retry-After on rate limits", () => {
    expect(toHttp(new ValidationError("Invalid input", { name: ["Required"] }), "r").body.error.details).toEqual({ name: ["Required"] });
    const limited = toHttp(new RateLimitError(120), "r");
    expect(limited.status).toBe(429);
    expect(limited.headers["Retry-After"]).toBe("120");
  });

  it("hides everything about unexpected errors (no stack, no message, no PII)", () => {
    const response = toHttp(new Error("password=hunter2 at /srv/app.ts:12"), "req-9");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response)).not.toMatch(/hunter2|app\.ts/);
    expect(response.body.error).toEqual({ code: "INTERNAL", message: "Something went wrong", requestId: "req-9" });
  });

  it("serializes to a problem+json Response", async () => {
    const response = toHttp(new NotFoundError(), "r").toResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Resource not found", requestId: "r" } });
  });

  it("recognizes a domain error thrown by another copy of the module (production bundles duplicate it)", async () => {
    vi.resetModules();
    const other = await import("@/domain/errors");
    const foreign = new other.NotFoundError();
    expect(foreign instanceof NotFoundError).toBe(false);
    expect(toHttp(foreign, "r").status).toBe(404);
  });
});
