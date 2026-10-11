# ADR 0016: Test pyramid and CI

Status: accepted (slice 0, completed in slice 9).

## Context

v1 had no tests. The v2 goal is that each v1 bug has a named test that would have caught it, and that everything runs
without a cloud account (REQ-LOC-04).

## Decision

| Layer | What | Where it runs |
|---|---|---|
| Unit (`pnpm test:unit`) | domain, application, adapters over fakes, UI components in jsdom, route handlers with a mocked container | everywhere, in seconds |
| Coverage (`pnpm test:coverage`) | v8 coverage of `domain` and `application`; below 90 % lines, branches, functions or statements fails | CI job and locally |
| Contract | ONE suite per port, run against every implementation: repositories on the in-memory fakes AND Postgres; `StoragePort` on the local adapter, S3 (RustFS) and, opt-in, Vercel Blob | integration project |
| Integration (`pnpm test:integration`) | real Postgres: cascades, uniqueness, races and deadlocks (reproduced as 40P01 with retries off), the deletion outbox, rate limiter, the REST endpoints end to end | local Docker, CI service containers |
| End to end (`pnpm e2e`) | Playwright on the production build (`next start`), local Postgres, filesystem storage | CI job and locally |

- Isolation (404 for strangers, 403 for weak roles) is a matrix over every use case and every REST endpoint.
- OpenAPI is validated in CI (`pnpm openapi:validate`), and unit tests fail if routes, operations, the document and the
  contract tests disagree.
- S3 and Blob tests that need real credentials are opt-in and reported as SKIPPED, never as passed. In CI
  `STORAGE_DRIVER=s3` makes an unreachable S3 server a FAILURE.
- GitHub Actions: `static` (lint, typecheck, depcruise, openapi), `unit` (coverage), `integration` (Postgres 17 and RustFS
  service containers, migrations, the seed run twice), `e2e` (Chromium, build, `pnpm e2e`) and `build`.

## Consequences

- A coverage badge ([docs/badges/coverage.svg](../badges/coverage.svg)) is regenerated with `pnpm coverage:badge`; the 90 %
  gate, not the badge, is what protects the number.
- The e2e suite shares one database and the demo's own rate limit (5 demo sign-ins per hour per address), so it runs
  on one worker and signs in once for the whole run.
- v1 bug to test traceability is in the README ("v1 to v2 lessons").
