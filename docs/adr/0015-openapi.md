# ADR 0015: REST API and OpenAPI generated from one operation table

Status: accepted (slice 7, 2026-10-10).

## Context

REQ-API-01 asks for a REST equivalent of every use case with no business logic in the routes, and REQ-API-02 for an
OpenAPI 3.1 document generated from the same Zod schemas the use cases validate with, failing CI when it is invalid or
an endpoint has no schema. The risk of two hand-kept descriptions (routes and document) is that they drift.

## Decision

**One table, two consumers.** `src/openapi/operations/*.ts` declares each operation once: method, path template, tag,
the path, query and body schemas (taken from `application/schemas` with `.omit`/`.pick`, so validation and
documentation are the same objects) and the response. The route handlers run it and the document is built from it:

- `src/app/api/v1/_lib/handle.ts` serves an operation by id (`handle("createTask")`): guard the request, gather
  `{ ...query, ...body, ...pathParams }` (path last, so a body can never aim at another id), call the use case of the
  same name through the container (already bound to the session), translate the outcome. A route file is
  `export const GET = handle("getTask")`.
- `src/openapi/registry.ts` turns the table into the document with `@asteasolutions/zod-to-openapi`.
- Tests keep the sets equal: route files on disk = operations = documented paths; every operation has a contract test.

**Library: `@asteasolutions/zod-to-openapi` 9.1.0**, pinned. Verified before adopting: it declares `zod ^4.0.0` as a peer
and works with the pinned Zod 4.6.5 (spike on the real schemas: defaults, `z.coerce`, `z.iso.date()`, `transform`
pipes, nullable, enums, discriminated unions). Alternative considered: Zod 4's own `z.toJSONSchema`, which converts one
schema but does not assemble paths, parameters and responses. The generated document is validated with
`@scalar/openapi-parser` 0.29.12 (dev dependency) by `pnpm openapi:validate` (CI static job) and by a unit test.

**Contract.**

| Concern | Decision |
|---|---|
| Auth | The session cookie, the same one the web app uses (`apiKey` in `cookie`). No tokens, no query-string credentials (REQ-API-04, REQ-API-05). |
| Errors | `toHttp` (restored from the web boundary): `{ error: { code, message, details?, requestId } }` as `application/problem+json`; 401/403/404/409/422/429/502, anything else 500 with no detail. Domain errors are recognised by brand, not `instanceof`, because a production build bundles the domain module more than once. |
| Not found | A malformed id in the path is a 404, the same answer as a missing or foreign one (REQ-ISO-08). A stranger and a missing resource differ in nothing, not even the message. |
| Lists | `{ items, nextCursor }`. The use cases page with `limit`/`offset`; the cursor is the next offset in base64url, opaque to clients. The handler asks the use case for ONE row more than the page (the use cases accept `limit` up to 201 for this; the REST query still caps `limit` at 200), so `nextCursor` is set only when another row exists: a list that ends exactly on a page boundary, even at 200, has no cursor to an empty page. Paging stops at item 10,000 (a deeper cursor is a 422, no cursor is handed out past it), documented on the `cursor` parameter and the 200 and 422 answers. `nextCursor` is always null for unpaginated lists. |
| Responses | Strict Zod objects (`z.strictObject`): a field that is not listed fails the contract tests, so a new column or a storage key cannot reach a client by accident. |
| CSRF | The cookie is `SameSite=Lax`; on top, a state-changing request that the browser labels cross-site (`Sec-Fetch-Site`) or whose `Origin` is not the app's host (or the host in `BETTER_AUTH_URL`) is refused with 403, and bodies must be `application/json` objects (a form or `text/plain` post is what a hostile page can send without a preflight). No CORS headers are ever sent. Clients that send neither header (curl, servers) are allowed. |
| Rate limit | Per client (hashed address), in Postgres like the rest: 600 reads and 120 writes per minute, 429 with `Retry-After`. The limits the use cases carry themselves (uploads, sign-in) apply unchanged because the REST routes call the same functions. |
| Cache | Every API response is `no-store`. Only `openapi.json` is public and cacheable. |

## Consequences

- `extendZodWithOpenApi(z)` patches Zod once (`src/openapi/zod.ts`); response schemas must be declared after it and name
  themselves with `.openapi("Name")` to become shared components.
- Zod 4 refuses `.omit()` on an object that has refinements, so a refined input exports its fields separately
  (`moveTaskFields`); the rule that survives only in the use case (exactly one of `afterTaskId` or `toEnd`) is stated in
  the operation summary.
- A `transform` pipe (file names, emails) is documented from its input side, which is what a client sends.
- `addMember` (by user id) and `listMembers` (raw rows) are not exposed: nothing in the web app calls them and a user id
  is not something a client should have to know; `addMemberByEmail` and the member directory cover the same needs.
- The REST variant of the download link returns the signed URL as JSON instead of redirecting; the web route keeps
  redirecting. Either way the URL is a credential and is never logged.
