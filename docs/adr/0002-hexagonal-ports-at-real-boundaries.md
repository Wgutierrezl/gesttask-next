# ADR 0002: Hexagonal layers, with ports only at real boundaries

Status: accepted (slices 0 and 1).

## Context

The v1 backend mixed HTTP, authorization, Mongo queries and S3 calls in the same functions: nothing could be tested
without a database, and the same missing check was repeated (or forgotten) in every route.

## Decision

Four layers, dependencies pointing inward only:

| Layer | Holds | Knows about |
|---|---|---|
| `domain` | entities, value objects (`Priority`, `BoardRole`, fractional `Position`), the role policy table, typed errors | nothing: plain TypeScript, no packages |
| `application` | one factory per use case (`makeMoveTask(deps)(actor, input)`), Zod schemas, the ports | `domain`, `zod` |
| `infrastructure` | Drizzle repositories, storage adapters, Better Auth, rate limiter, env parsing, the composition root | `application`, `domain` |
| `app`, `components` | pages, Server Actions, route handlers, UI | `application`, the container |

A use case receives the `Actor` (`{ userId, isGuest }`), validates its input, authorizes, runs inside a `UnitOfWork` when
it writes, and THROWS a typed domain error. Adapters translate; nothing crosses a boundary as a raw exception.

Ports exist only where something real sits behind them: the repositories, `UnitOfWork`, `StoragePort`, `SessionPort`,
`AuthPort`, `RateLimiter`, `GuestSandbox`, the deletion outbox, `Clock` and `IdGenerator`. There is no port for pure logic
(the policy, position generation) and no repository-per-method wrapper "for symmetry".

## Consequences

- The use-case suite runs on in-memory fakes in milliseconds, and the SAME contract suites run against the fakes and the
  Drizzle repositories, so a fake cannot drift from Postgres unnoticed.
- Swapping Better Auth, S3 or the database touches `infrastructure` only: the three storage drivers (S3, Vercel Blob,
  local filesystem) sit behind one port and one contract suite ([ADR 0009](0009-storage.md)).
- The cost is ceremony: a new use case is a factory, a schema, a registry entry and a route declaration. The registry and
  route tests make forgetting one a failing test rather than a runtime surprise.
