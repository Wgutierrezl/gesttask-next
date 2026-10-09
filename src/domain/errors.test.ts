import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  StorageError,
  UnauthenticatedError,
  ValidationError,
} from "./errors";

describe("domain errors", () => {
  it.each([
    [new ValidationError(), "VALIDATION"],
    [new UnauthenticatedError(), "UNAUTHENTICATED"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new NotFoundError(), "NOT_FOUND"],
    [new ConflictError(), "CONFLICT"],
    [new RateLimitError(30), "RATE_LIMITED"],
    [new StorageError(), "STORAGE"],
  ])("%o carries its stable code", (error, code) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(error.constructor.name);
  });

  it("keeps field errors and retry hints", () => {
    expect(new ValidationError("bad", { title: ["required"] }).fieldErrors).toEqual({ title: ["required"] });
    expect(new RateLimitError(30).retryAfterSeconds).toBe(30);
  });

  it("NotFoundError never reveals whether the resource exists", () => {
    expect(new NotFoundError().message).toBe(new NotFoundError().message);
  });
});
