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

describe("error reasons", () => {
  it("carry a stable reason and its params when the throw site gives one", () => {
    const conflict = new ConflictError("Stage has tasks", { reason: "stage.hasTasks", params: { count: 3 } });
    expect(conflict.reason).toBe("stage.hasTasks");
    expect(conflict.params).toEqual({ count: 3 });
    expect(conflict.message).toBe("Stage has tasks");
    expect(new ForbiddenError("No", { reason: "guest.cannotInvite" }).reason).toBe("guest.cannotInvite");
    expect(new UnauthenticatedError("Bad", { reason: "auth.invalidCredentials" }).reason).toBe("auth.invalidCredentials");
  });

  it("have no reason by default, so the code default applies", () => {
    for (const error of [new ConflictError(), new ForbiddenError(), new NotFoundError(), new ValidationError()]) {
      expect(error.reason).toBeUndefined();
      expect(error.params).toBeUndefined();
    }
  });

  it("let a validation error give a reason per field message", () => {
    const error = new ValidationError("Invalid input", { email: ["No account"] }, { email: [{ reason: "email.notFound" }] });
    expect(error.fieldReasons).toEqual({ email: [{ reason: "email.notFound" }] });
    expect(new ValidationError().fieldReasons).toEqual({});
  });
});
