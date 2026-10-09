# ADR 0004: Better Auth behind SessionPort and AuthPort (draft)

Status: draft (spike 3.0, 2026-10-09). Finalized with the README in slice 9.

## Decision

Authentication is delegated to Better Auth, pinned to `better-auth@1.7.7`, and never leaks past
`src/infrastructure/auth`. Use cases only see `Actor { userId, isGuest }` through `SessionPort.getActor()`
and the sign-in flows through `AuthPort`. `domain` and `application` do not import Better Auth.

## Spike findings (verified against the installed 1.7.7 package, not from memory)

| Question | Finding |
|---|---|
| Drizzle adapter | `drizzleAdapter(db, { provider: "pg" })` from `better-auth/adapters/drizzle` (re-export of `@better-auth/drizzle-adapter`). Reads the tables from the `schema` the drizzle instance was created with, keyed by model name: `user`, `session`, `account`, `verification`. |
| Guest flow | `anonymous()` from `better-auth/plugins`. Server API: `auth.api.signInAnonymous({ headers })`; it creates a `user` with `isAnonymous = true` and a placeholder email, and a session. A second call while already anonymous returns 400, so the guest use case checks the existing session first. |
| Cookies in Next | `nextCookies()` from `better-auth/next-js` must be the LAST plugin; it lets `auth.api.*` calls from Server Actions set the session cookie. Route handler: `toNextJsHandler(auth)` exports `GET/POST/...`. |
| Reading the session | `auth.api.getSession({ headers })`; returns `null` without a valid session. |
| Linking | Signing in or up while anonymous fires `onLinkAccount({ anonymousUser, newUser })`, then deletes the anonymous user unless `disableDeleteAnonymousUser: true`. |
| Deleting guests | `/delete-anonymous-user` deletes the signed-in anonymous user. Bulk cleanup is not provided: we purge by `is_anonymous` and age ourselves. |
| Schema generation | `@better-auth/cli@1.4.21 generate --config <file with exported auth>` emits the Drizzle tables (run through `pnpm dlx`, not a dependency). The generated shape is mirrored in `schema.ts`; a test compares it with `getAuthTables` so drift fails CI. |
| Env | `BETTER_AUTH_SECRET` (min 32 chars) and optional `BETTER_AUTH_URL`; validated by Zod in `config/env.ts`. |

## Decisions taken while implementing slice 3

- Foreign keys to `user`: memberships cascade, `tasks.assignee_id` is set to null, `comments.author_id` and
  `attachments.uploader_id` RESTRICT, so deleting a user can never silently drop comments or orphan storage
  objects; they go away only through the board delete (where slice 6 queues the objects).
- A guest is an anonymous user that owns a sandbox cloned from the demo board under a deterministic id, so
  provisioning is idempotent and race-free. Quotas: 3 boards and 200 tasks (soft under concurrency).
- Signing in or up from a guest session moves the sandbox to the account (`transferGuestData`).
- Guest sandboxes expire 24 hours after creation; `purgeExpiredGuests` is invoked by the cron in slice 9.
- Rate limits live in Postgres, keyed by an HMAC of the client address: guest 5/h, email login 10/15 min per
  client and email, sign-up 10/h.
- `proxy.ts` only pre-filters on the cookie; the `(app)` layout validates the session and every use case is
  reached through `withActor`.

## Consequences

- Our rate limiter (Postgres) guards sign-in; Better Auth's built-in limiter is not relied upon.
- Anonymous users are kept on link (`disableDeleteAnonymousUser: true`) so we can move their sandbox to the
  new account first; the TTL cleanup removes the leftover anonymous row.
- Authentication tables are owned by migrations, never by Better Auth's own migrator.
