# ADR 0013: Rate limits live in Postgres, keyed by a hashed client address and by user

Status: accepted (slices 3, 6, 7, 8 and 9).

## Context

Serverless instances do not share memory, so an in-process limiter limits nothing; adding Redis would add a service just
for counters. The demo accepts anonymous visitors and file uploads, which is exactly what gets abused.

## Decision

- `PgRateLimiter` is a fixed-window counter: one atomic `INSERT ... ON CONFLICT DO UPDATE` on `rate_limits(key, window_start)`
  that returns the new count. Past the limit the caller gets `RateLimitError` (429 with `Retry-After` as the seconds left
  in the window). A daily cron deletes windows older than a day ([ADR 0018](0018-guest-sandbox-and-scheduled-maintenance.md)).
- The client key is an HMAC of the client address under a subkey of the auth secret: raw addresses never reach the
  database or the logs. The address comes from Vercel's edge header, or from `x-forwarded-for` counted `TRUSTED_PROXY_HOPS`
  entries from the right (everything to the left is the client's claim). With no trustworthy address, production FAILS
  CLOSED (sign-in refuses, the API answers 503, startup logs what to set) instead of putting every caller in one bucket.
  Development and tests use a single local bucket.
- Rules: demo sign-in 5 per hour per address; email sign-in 10 per 15 minutes per address and email (and 50 per hour per
  email across addresses); sign-up 10 per hour per address; upload requests 20 per hour per user (5 for demo guests).
- REST API, per minute, reads and writes counted separately (600 and 120 for one user from one address):
  1. the ADDRESS bucket (5x) is charged BEFORE the session is looked up, so a flood of junk cookies is throttled without
     costing a database read;
  2. once the user is known, user+address (1x) and the user alone (3x, across addresses) are charged, so a user who
     rotates addresses cannot multiply their budget, and users sharing an address (an office, a carrier NAT) do not
     exhaust each other.
- `x-forwarded-proto`, used for the CSRF origin check, is read with the same rule: `hops` entries from the right.

## Consequences

- One extra upsert per limited request (three for a signed-in API call); acceptable at this scale, and it is the price of
  needing no extra service.
- Fixed windows allow a burst of twice the limit across a window boundary. For abuse control that is fine; precise
  fairness would need a sliding window.
- Rate-limit tests that spend a whole budget wait for a fresh window first, so a minute boundary cannot reset the counter
  under them.
