# ADR 0008: Typed domain errors, translated once per boundary

Status: accepted (slices 1, 4 and 7).

## Context

v1 returned `null` or `[]` on failure and success alike, treated a count of 0 as an error (`!response || response.length`)
and swallowed S3 failures by returning an empty string.

## Decision

- Use cases throw typed errors from `domain/errors`: `ValidationError` (with field errors), `UnauthenticatedError`,
  `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `StorageError`, `UnavailableError`. An empty
  list is `[]`, a zero count is `0`, and both are successes.
- Two translators, one each: `toActionResult` (Server Actions: `{ ok: false, code, fieldErrors }`) and `toHttp` (REST:
  status plus an `application/problem+json` body `{ error: { code, message, details?, requestId } }`).

| Error | HTTP | Notes |
|---|---|---|
| Validation | 422 | `details` maps each field to its messages |
| Unauthenticated | 401 | checked before the request is parsed |
| Forbidden | 403 | only for members with too low a role |
| NotFound | 404 | also for strangers and malformed ids |
| Conflict | 409 | duplicate member, last owner, stage with tasks |
| RateLimit | 429 | with `Retry-After` |
| Storage | 502 | |
| Unavailable | 503 | the deployment cannot identify clients ([ADR 0013](0013-rate-limits-in-postgres.md)) |
| malformed or oversized body | 400, 413 | raised by the HTTP adapter |
| anything else | 500 | logged with the request id; the client sees a generic message, never a stack |

- Errors carry a `Symbol.for` brand and are recognized with `isDomainError`: the production build gives route handlers
  their own copy of the domain modules, so `instanceof` failed there (found by a browser smoke test, fixed in slice 6).

## Consequences

- Nothing is swallowed: an unknown error is a 500 with a log line, never a quiet default.
- The cost of the brand is that new error classes must extend the same base class (`DomainError`); a cross-bundle test
  covers the translator.
