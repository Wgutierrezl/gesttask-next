import { isDomainError, type FieldErrors } from "@/domain/errors";
import type { ActionFailure, ActionResult } from "./result";

/** The single translation from thrown domain errors to the serializable result Server Actions return. */
export function toActionFailure(error: unknown): ActionFailure {
  if (!isDomainError(error)) return { ok: false, code: "INTERNAL", message: "Something went wrong" };
  const failure: ActionFailure = { ok: false, code: error.code, message: error.message };
  // Structural, not `instanceof`: the error may come from another copy of the domain module.
  const { fieldErrors, retryAfterSeconds } = error as { fieldErrors?: FieldErrors; retryAfterSeconds?: number };
  if (error.code === "VALIDATION" && fieldErrors && Object.keys(fieldErrors).length > 0) failure.fieldErrors = fieldErrors;
  if (error.code === "RATE_LIMITED" && retryAfterSeconds !== undefined) failure.retryAfterSeconds = retryAfterSeconds;
  return failure;
}

/**
 * Runs `work` and never throws: domain errors become typed failures, anything else becomes INTERNAL with no
 * detail for the client and is handed to `onUnexpected` (the caller logs it, redacted).
 */
export async function runAction<T>(work: () => Promise<T>, onUnexpected?: (error: unknown) => void): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (!isDomainError(error)) onUnexpected?.(error);
    return toActionFailure(error);
  }
}
