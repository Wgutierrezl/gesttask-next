export type DomainErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "STORAGE";

/** Base of every error the core throws; adapters translate it, nothing else crosses the boundary. */
export class DomainError extends Error {
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
