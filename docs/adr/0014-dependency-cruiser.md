# ADR 0014: Layer rules are enforced by dependency-cruiser in CI

Status: accepted (slice 0, extended in slices 7 and 8).

## Context

A layering convention that nothing checks erodes with the first deadline. The rules also have to cover npm packages
(`domain` imports none), which rules out tools that only look at folders.

## Decision

`pnpm depcruise` (also a CI step) fails on any violation of `.dependency-cruiser.cjs`:

| Rule | Meaning |
|---|---|
| `domain-is-self-contained` | `domain` imports nothing outside `domain`: no packages, no Node built-ins, not even Zod |
| `application-depends-on-domain-and-zod-only` | no `next`, `react`, `drizzle-orm`, no `infrastructure` |
| `app-uses-application-and-container-only` | pages, actions and components reach business logic through `application` and the composition root only |
| `openapi-declares-over-application-only` | the REST contract is built from application schemas and never reaches infrastructure or React |

Colocated unit tests are exempt (they may import the runner). A fixture suite (`tests/unit/depcruise.test.ts`) feeds the
tool deliberately bad imports and expects each rule to fire, so a rule cannot silently stop working.

## Consequences

- `pnpm depcruise:graph` emits the dependency graph (DOT) from the same configuration.
- The rules caught real mistakes while building (a dashboard component importing a domain type, now a local structural
  type), at the cost of a few duplicated type declarations at the UI edge.
- `eslint-plugin-boundaries` was considered; it is weaker on rules about external packages and cannot produce a graph.
