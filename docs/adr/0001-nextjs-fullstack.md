# ADR 0001: One Next.js application for the UI and the API

Status: accepted (slice 0).

## Context

GestTask v1 was two repositories (an Express and MongoDB API, a React SPA) with two deployments, two sets of types and a
hand-kept contract between them. The v1 bugs that came from that seam (enum values the front end and the back end spelled
differently, a `priodidad` typo read back as `prioridad`) cannot happen when both sides share one type system.

## Decision

A single Next.js 16 application (App Router, React 19, strict TypeScript):

- Pages are Server Components that call use cases directly; mutations are Server Actions.
- The public REST API is served by Route Handlers under `/api/v1` ([ADR 0007](0007-actions-and-rest-same-use-cases.md)).
- One repository, one deployment unit, one `pnpm build`. Vercel Hobby runs it; nothing in the code needs Vercel
  (`next start` serves the same build, which is what the end-to-end tests do).

## Consequences

- Enums, validation schemas and error codes exist once and are imported on both sides.
- The server and the browser share a repository, so the dependency rules ([ADR 0014](0014-dependency-cruiser.md)) are what
  keep the UI from reaching into persistence.
- A separate API deployment, or a mobile client, would be a new adapter over the same use cases, not a rewrite.
- The price: framework upgrades touch the UI and the API together, and Vercel function limits (4.5 MB bodies, execution
  time) apply to everything ([ADR 0010](0010-presigned-post.md) is the answer to the first).
