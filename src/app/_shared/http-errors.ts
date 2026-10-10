/**
 * Failures that exist only at the HTTP edge: the request itself is unusable before any use case could judge it. They are
 * not domain errors (a Server Action never has a malformed body), so they live with the adapter.
 */
const BRAND = Symbol.for("gesttask.http-request-error");

export class HttpRequestError extends Error {
  readonly [BRAND] = true;

  constructor(
    readonly status: 400 | 413,
    readonly code: "BAD_REQUEST" | "PAYLOAD_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export const badRequest = (message: string) => new HttpRequestError(400, "BAD_REQUEST", message);
export const payloadTooLarge = (message: string) => new HttpRequestError(413, "PAYLOAD_TOO_LARGE", message);

/** Structural, like `isDomainError`: a route bundle may hold its own copy of this module. */
export const isHttpRequestError = (error: unknown): error is HttpRequestError =>
  error instanceof Error && (error as unknown as Record<symbol, unknown>)[BRAND] === true;
