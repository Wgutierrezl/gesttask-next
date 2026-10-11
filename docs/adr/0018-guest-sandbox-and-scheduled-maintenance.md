# ADR 0018: Demo visitors get a private sandbox; one daily cron cleans up

Status: accepted (slices 3, 6 and 9). Numbered after the design's list: ADR 0005 went to member invitations.

## Context

A recruiter must reach a board with data in under 30 seconds and be free to drag, comment and upload without affecting
anyone else. A global "reset the demo" job would overwrite concurrent visitors, and Vercel Hobby crons run once a day.

## Decision

- "Try the demo" creates an anonymous Better Auth user ([ADR 0004](0004-better-auth.md)) and clones the demo board for it
  (`SeededGuestSandbox`, fixed board id derived from the user id, so provisioning twice or concurrently yields one sandbox).
  The visitor owns the clone; the clone also has a read-only `demo-viewer` member to show the `guest` role.
- Abuse limits ([ADR 0013](0013-rate-limits-in-postgres.md), REQ-SEC-04): 3 boards, 200 tasks and 5 attachments per demo
  user, 5 MB each, demo sign-in 5 per hour per address. A demo user and its sandbox live 24 hours.
- `GET /api/cron/reset`, scheduled once a day by `vercel.json` (`0 4 * * *`, the most often Hobby allows), requires
  `Authorization: Bearer $CRON_SECRET` (compared in constant time; with no secret configured it answers 401 to everyone).
  It runs, in this order, each job isolated from the others' failures: a database warm-up query, `purgeExpiredGuests`
  (expired demo users and their sandboxes; the storage keys are queued in the same transaction), `sweepPendingUploads`
  (uploads never attached to a comment after an hour), `drainStorageDeletions` ([ADR 0011](0011-deletion-outbox.md)), and
  the rate-limit trim. A failed job logs by name and makes the response a 500 with a report, so the platform shows the run
  as failed.
- The fast path for object deletion is not the cron: a delete in the app drains the outbox right after the response
  (`after()`); the cron is the safety net.
- The shared demo board (fixed id, seeded with comments and two attachments by `pnpm db:seed`) is a template that nobody
  can modify: its members are login-less demo accounts. So the cron has nothing to "restore"; what resets is each visitor's
  own sandbox, which is fresh on sign-in.

## Consequences

- A demo user can live up to 48 hours (24 hours of TTL, then until the next daily run). Nothing reads expired sandboxes
  in between, and the quotas bound what they can hold.
- Vercel Hobby is non-commercial use only; the README says so.
- Sandboxes get the demo's comments without attachments (copying objects per visitor is not worth it); the shared board
  carries the attachments.
- `pnpm db:seed` stores the two sample objects BEFORE the rows that point at them. If the run then fails (or loses a
  race) it deletes the objects again, best effort: a failed deletion is logged with the keys and never replaces the
  original error. In that rare case the objects stay in the bucket as orphans (no row points at them). They are small and
  harmless, a rerun uses new keys, and nothing else cleans them: delete them by hand under `boards/{demo board id}/` if
  they bother you.
