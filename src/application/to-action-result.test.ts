import { describe, expect, it } from "vitest";
import {
  ConflictError, ForbiddenError, NotFoundError, RateLimitError, StorageError, UnauthenticatedError, ValidationError,
} from "@/domain/errors";
import { runAction } from "./to-action-result";

describe("runAction", () => {
  it("wraps a successful result", async () => {
    expect(await runAction(async () => ({ id: 1 }))).toEqual({ ok: true, data: { id: 1 } });
  });

  it("keeps null and empty results as successes", async () => {
    expect(await runAction(async () => null)).toEqual({ ok: true, data: null });
    expect(await runAction(async () => [])).toEqual({ ok: true, data: [] });
  });

  it.each([
    [new UnauthenticatedError(), "UNAUTHENTICATED"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new NotFoundError(), "NOT_FOUND"],
    [new ConflictError("dup"), "CONFLICT"],
    [new StorageError(), "STORAGE"],
  ])("maps %s to its code and message", async (error, code) => {
    expect(await runAction(async () => { throw error; })).toEqual({ ok: false, code, message: error.message });
  });

  it("carries field errors and retry-after hints", async () => {
    const invalid = await runAction(async () => { throw new ValidationError("Invalid input", { email: ["bad"] }); });
    expect(invalid).toEqual({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { email: ["bad"] } });
    const limited = await runAction(async () => { throw new RateLimitError(90); });
    expect(limited).toEqual({ ok: false, code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 90 });
  });

  it("reports unexpected errors to the callback and hides their details from the caller", async () => {
    const seen: unknown[] = [];
    const result = await runAction(async () => { throw new Error("db password=hunter2"); }, (error) => seen.push(error));
    expect(result).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong" });
    expect(seen).toHaveLength(1);
  });

  it("does not report expected domain errors as bugs", async () => {
    const seen: unknown[] = [];
    await runAction(async () => { throw new NotFoundError(); }, (error) => seen.push(error));
    expect(seen).toEqual([]);
  });
});
