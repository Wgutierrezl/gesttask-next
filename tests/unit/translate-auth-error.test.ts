import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { ConflictError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import { translateAuthError } from "@/infrastructure/auth/auth-port";

const api = (status: ConstructorParameters<typeof APIError>[0], body?: { code?: string; message?: string }) => new APIError(status, body);

describe("translateAuthError", () => {
  it.each([
    ["duplicate account", api("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }), ConflictError],
    ["second guest login", api("BAD_REQUEST", { code: "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY" }), ConflictError],
    ["bad credentials", api("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD" }), UnauthenticatedError],
    ["unverified account", api("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED" }), UnauthenticatedError],
    ["bad input", api("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT", message: "Password too short" }), ValidationError],
    ["bad input without a body", api("UNPROCESSABLE_ENTITY"), ValidationError],
  ])("maps %s", (_name, error, expected) => {
    expect(() => translateAuthError(error)).toThrow(expected);
  });

  it("never reveals which credential was wrong", () => {
    expect(() => translateAuthError(api("UNAUTHORIZED", { message: "User not found" }))).toThrow("Invalid email or password");
  });

  it("lets unexpected failures through untouched", () => {
    const server = api("INTERNAL_SERVER_ERROR");
    expect(() => translateAuthError(server)).toThrow(server);
    const boom = new TypeError("boom");
    expect(() => translateAuthError(boom)).toThrow(boom);
  });
});
