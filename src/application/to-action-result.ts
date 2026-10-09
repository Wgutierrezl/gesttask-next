import { DomainError, RateLimitError, ValidationError } from "@/domain/errors";
import type { ActionFailure, ActionResult } from "./result";

/** The single translation from thrown domain errors to the serializable result Server Actions return. */
export function toActionFailure(error: unknown): ActionFailure {
  if (!(error instanceof DomainError)) return { ok: false, code: "INTERNAL", message: "Something went wrong" };
  const failure: ActionFailure = { ok: false, code: error.code, message: error.message };
  if (error instanceof ValidationError && Object.keys(error.fieldErrors).length > 0) failure.fieldErrors = error.fieldErrors;
  if (error instanceof RateLimitError) failure.retryAfterSeconds = error.retryAfterSeconds;
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
    if (!(error instanceof DomainError)) onUnexpected?.(error);
    return toActionFailure(error);
  }
}
