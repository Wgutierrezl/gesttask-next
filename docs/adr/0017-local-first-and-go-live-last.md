# ADR 0017: Everything runs locally; cloud accounts are connected last, by configuration only

Status: accepted (slice 0, completed in slice 9).

## Context

A portfolio project that needs an AWS account to run its tests is a project nobody can clone and check. The cloud
accounts (Neon, AWS, Vercel) also cost attention and, for S3, money if abused.

## Decision

- `docker compose up` gives Postgres and an S3-compatible server (RustFS; the MinIO images are no longer published).
  `.env.example` has working local defaults, validated at startup by Zod (a driver's credentials are required only when
  that driver is selected, and messages name keys, never values).
- Drivers are configuration, not code: `DB_DRIVER=pg|neon`, `STORAGE_DRIVER=local|s3|blob`. Moving to production changes
  environment variables only (REQ-LOC-05).
- The local storage driver is refused on Vercel (its filesystem is read-only and per instance) and warns in any other
  production build.
- Go-live is a checklist in [docs/go-live.md](../go-live.md), with the AWS Budgets alert as the FIRST step, before a
  bucket or an access key exists.

## Consequences

- The Neon driver and the real S3 and Blob adapters are exercised against their real services only at go-live; until then
  the evidence is the shared contract suite against RustFS and the fake Blob API. The checklist ends with a smoke test
  against production for that reason.
- Nothing secret is in the repository: `.env*` is ignored apart from `.env.example`, whose secrets are placeholders that
  production refuses.
