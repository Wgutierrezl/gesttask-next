import type { ActionFailure } from "@/application/result";
import { toActionFailure } from "@/application/to-action-result";

const STATUS: Record<string, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  STORAGE: 502,
  INTERNAL: 500,
};

export interface HttpErrorBody {
  error: { code: string; message: string; details?: ActionFailure["fieldErrors"]; requestId: string };
}

export interface HttpError {
  status: number;
  headers: Record<string, string>;
  body: HttpErrorBody;
  toResponse(): Response;
}

/**
 * The one translation from a thrown error to an HTTP error (REQ-API-03), built on the same mapping Server
 * Actions use so both adapters report identical codes. Unexpected errors carry no detail at all.
 */
export function toHttp(error: unknown, requestId: string): HttpError {
  const failure = toActionFailure(error);
  const headers: Record<string, string> = {};
  if (failure.retryAfterSeconds !== undefined) headers["Retry-After"] = String(failure.retryAfterSeconds);
  const body: HttpErrorBody = { error: { code: failure.code, message: failure.message, requestId } };
  if (failure.fieldErrors) body.error.details = failure.fieldErrors;
  const status = STATUS[failure.code] ?? 500;
  return {
    status,
    headers,
    body,
    toResponse: () => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/problem+json" } }),
  };
}
