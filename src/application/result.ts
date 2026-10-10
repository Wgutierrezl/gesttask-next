import type { DomainErrorCode, FieldErrors } from "@/domain/errors";

export type ActionFailure = {
  ok: false;
  code: DomainErrorCode | "INTERNAL";
  message: string;
  fieldErrors?: FieldErrors;
  /** Set on RATE_LIMITED: seconds until the caller may retry. */
  retryAfterSeconds?: number;
};

/** Serializable outcome of a use case at the Server Action boundary. */
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;
