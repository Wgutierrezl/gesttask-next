import type { DomainErrorCode, FieldErrors } from "@/domain/errors";

/** Serializable outcome of a use case at the Server Action boundary. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DomainErrorCode | "INTERNAL"; message: string; fieldErrors?: FieldErrors };
