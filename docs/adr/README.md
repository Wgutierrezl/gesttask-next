# Architecture decision records

Short records of the decisions that shape GestTask: the context, what was decided, and what it costs. Newest knowledge
wins: an ADR is amended in place when a later slice changes it, and says so in its text.

| ADR | Decision |
|---|---|
| [0001](0001-nextjs-fullstack.md) | One Next.js application for the UI and the API |
| [0002](0002-hexagonal-ports-at-real-boundaries.md) | Hexagonal layers, with ports only at real boundaries |
| [0003](0003-postgres-drizzle-drivers.md) | Postgres with Drizzle, two drivers, migrations as a deploy step |
| [0004](0004-better-auth.md) | Better Auth behind `SessionPort` and `AuthPort` |
| [0005](0005-member-invitations-without-consent.md) | Adding members by email, without their consent |
| [0006](0006-authorization-single-policy.md) | One authorization policy inside the use case; strangers get 404 |
| [0007](0007-actions-and-rest-same-use-cases.md) | Server Actions and the REST API call the same use cases |
| [0008](0008-domain-errors-to-results.md) | Typed domain errors, translated once per boundary |
| [0009](0009-storage.md) | Storage: S3 primary, Vercel Blob fallback, local for development |
| [0010](0010-presigned-post.md) | Uploads go straight to the storage with a size-capped, type-pinned ticket |
| [0011](0011-deletion-outbox.md) | An outbox for deleting storage objects, and the global lock order |
| [0012](0012-fractional-positions.md) | Order is a fractional index |
| [0013](0013-rate-limits-in-postgres.md) | Rate limits live in Postgres, keyed by hashed address and by user |
| [0014](0014-dependency-cruiser.md) | Layer rules enforced by dependency-cruiser in CI |
| [0015](0015-openapi.md) | The OpenAPI document is generated from the operation table |
| [0016](0016-testing-strategy-and-ci.md) | Test pyramid and CI |
| [0017](0017-local-first-and-go-live-last.md) | Everything runs locally; cloud accounts last, by configuration |
| [0018](0018-guest-sandbox-and-scheduled-maintenance.md) | Demo visitors get a private sandbox; one daily cron cleans up |
