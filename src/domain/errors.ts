export type DomainErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "STORAGE";

/**
 * Shared across copies of this module on purpose: a bundler may load the domain twice (e.g. a route handler and the page
 * that built the container), and `instanceof` then fails between the copies while the brand still matches.
 */
const DOMAIN_ERROR_BRAND = Symbol.for("gesttask.domain-error");

/** Base of every error the core throws; adapters translate it, nothing else crosses the boundary. */
export class DomainError extends Error {
  readonly [DOMAIN_ERROR_BRAND] = true;

  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export type FieldErrors = Record<string, string[]>;

export class ValidationError extends DomainError {
  constructor(
    message = "Invalid input",
    readonly fieldErrors: FieldErrors = {},
  ) {
    super("VALIDATION", message);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message);
  }
}

/** Only for members whose role is insufficient; non-members get NotFoundError instead. */
export class ForbiddenError extends DomainError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message);
  }
}

/** Missing and foreign resources MUST be indistinguishable (REQ-ISO-08): one fixed message. */
export class NotFoundError extends DomainError {
  constructor() {
    super("NOT_FOUND", "Resource not found");
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Conflict") {
    super("CONFLICT", message);
  }
}

export class RateLimitError extends DomainError {
  constructor(
    readonly retryAfterSeconds: number,
    message = "Too many requests",
  ) {
    super("RATE_LIMITED", message);
  }
}

export class StorageError extends DomainError {
  constructor(message = "Storage operation failed") {
    super("STORAGE", message);
  }
}

/** True for errors thrown by this core, even when they come from another copy of the module (see `DOMAIN_ERROR_BRAND`). */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof Error && (error as unknown as Record<symbol, unknown>)[DOMAIN_ERROR_BRAND] === true;
}
