# ADR 0007: Server Actions and the REST API call the same use cases

Status: accepted (slices 4 and 7).

## Context

The web app needs Server Actions; integrators and the demo "Try it" client need a documented REST API. Two code paths
would mean two sets of rules, and v1's front end and back end disagreed about what the rules were.

## Decision

- The container exposes `useCases`, every one bound to the session (`guardAll`): callers pass the input only and cannot
  choose the actor. Actions (`runAction`) and route handlers (`handle("operationId")`) are thin adapters over them.
- REST operations are declared once, in the operation table (`src/openapi/operations/*`). The same table generates the
  route handlers' behaviour, the OpenAPI 3.1 document ([ADR 0015](0015-openapi.md)) and the tests that every route, every
  operation and every use case exist together.
- `handle` does only HTTP work: rate limit, same-origin check for mutations, session, path/query/body gathering, status
  mapping, request id. No business rule lives in a route.

## Consequences

- A parity suite sends the same input through an action and through REST and expects the same result code and field
  errors.
- Not every use case is exposed: `addMember` (by user id) and `listMembers` (raw rows) stay internal because their REST
  counterparts take an email and return profiles; ADR 0015 lists them.
- Adding an endpoint is: declare the operation, add the one-line route file, write its contract test. Forgetting any
  piece fails a test.
