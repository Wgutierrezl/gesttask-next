import type { DomainErrorCode, ErrorDetail, FieldErrors, FieldReasons } from "@/domain/errors";

export type ActionFailure = {
  ok: false;
  code: DomainErrorCode | "INTERNAL";
  message: string;
  fieldErrors?: FieldErrors;
  /** What the web adapter translates; REST ignores it, so its bodies keep the English `message` and `fieldErrors`. */
  reason?: ErrorDetail["reason"];
  params?: ErrorDetail["params"];
  fieldReasons?: FieldReasons;
  /** Set on RATE_LIMITED: seconds until the caller may retry. */
  retryAfterSeconds?: number;
};

/** Serializable outcome of a use case at the Server Action boundary. */
export type ActionResult<T> = { ok: true; data: T } | ActionFailure;
