export type DomainErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "STORAGE"
  | "UNAVAILABLE";

/** The English text each code carries when its throw site has nothing more specific to say. */
export const DEFAULT_MESSAGES = {
  VALIDATION: "Invalid input",
  UNAUTHENTICATED: "Authentication required",
  FORBIDDEN: "Insufficient permissions",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Conflict",
  RATE_LIMITED: "Too many requests",
  STORAGE: "Storage operation failed",
  UNAVAILABLE: "The service is temporarily unavailable",
  INTERNAL: "Something went wrong",
} as const satisfies Record<DomainErrorCode | "INTERNAL", string>;

/**
 * Shared across copies of this module on purpose: a bundler may load the domain twice (e.g. a route handler and the page
 * that built the container), and `instanceof` then fails between the copies while the brand still matches.
 */
const DOMAIN_ERROR_BRAND = Symbol.for("gesttask.domain-error");

/**
 * A stable, language-free key (e.g. `stage.hasTasks`) plus the values its translation interpolates. The message stays
 * English for REST; the web adapter translates the reason where it renders (ADR 0021). No reason: the code's default applies.
 */
export interface ErrorDetail {
  reason: string;
  params?: Record<string, string | number>;
}

/** Base of every error the core throws; adapters translate it, nothing else crosses the boundary. */
export class DomainError extends Error {
  readonly [DOMAIN_ERROR_BRAND] = true;
  readonly reason?: string;
  readonly params?: ErrorDetail["params"];

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    detail?: ErrorDetail,
  ) {
    super(message);
    this.name = new.target.name;
    this.reason = detail?.reason;
    this.params = detail?.params;
  }
}

export type FieldErrors = Record<string, string[]>;
/** Per field, one entry for each message in `FieldErrors` (null where that message has no reason). */
export type FieldReasons = Record<string, (ErrorDetail | null)[]>;

export class ValidationError extends DomainError {
  constructor(
    message: string = DEFAULT_MESSAGES.VALIDATION,
    readonly fieldErrors: FieldErrors = {},
    readonly fieldReasons: FieldReasons = {},
    detail?: ErrorDetail,
  ) {
    super("VALIDATION", message, detail);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message: string = DEFAULT_MESSAGES.UNAUTHENTICATED, detail?: ErrorDetail) {
    super("UNAUTHENTICATED", message, detail);
  }
}

/** Only for members whose role is insufficient; non-members get NotFoundError instead. */
export class ForbiddenError extends DomainError {
  constructor(message: string = DEFAULT_MESSAGES.FORBIDDEN, detail?: ErrorDetail) {
    super("FORBIDDEN", message, detail);
  }
}

/** Missing and foreign resources MUST be indistinguishable (REQ-ISO-08): one fixed message. */
export class NotFoundError extends DomainError {
  constructor() {
    super("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string = DEFAULT_MESSAGES.CONFLICT, detail?: ErrorDetail) {
    super("CONFLICT", message, detail);
  }
}

export class RateLimitError extends DomainError {
  constructor(
    readonly retryAfterSeconds: number,
    message: string = DEFAULT_MESSAGES.RATE_LIMITED,
  ) {
    super("RATE_LIMITED", message);
  }
}

export class StorageError extends DomainError {
  constructor(message: string = DEFAULT_MESSAGES.STORAGE) {
    super("STORAGE", message);
  }
}

/** The service cannot take the request right now because of how it is deployed or configured, not because of the request. */
export class UnavailableError extends DomainError {
  constructor(message: string = DEFAULT_MESSAGES.UNAVAILABLE) {
    super("UNAVAILABLE", message);
  }
}

/** True for errors thrown by this core, even when they come from another copy of the module (see `DOMAIN_ERROR_BRAND`). */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof Error && (error as unknown as Record<symbol, unknown>)[DOMAIN_ERROR_BRAND] === true;
}
