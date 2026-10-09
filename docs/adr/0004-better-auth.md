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

- Foreign keys to `user`: memberships cascade, `tasks.assignee_id`, `comments.author_id` and
  `attachments.uploader_id` are set to null (migration 0005 relaxed the last two from RESTRICT). Deleting a user
  or purging a guest therefore never blocks and never drops comments; the UI will show "Deleted user". Storage
  objects are still released only through the board delete (slice 6 queues them).
- A guest is an anonymous user that owns a sandbox cloned from the demo board under a deterministic id, so
  provisioning is idempotent and race-free. Quotas: 3 boards and 200 tasks (soft under concurrency).
- Signing in or up from a guest session moves the sandbox to the account (`transferGuestData`).
- Guest sandboxes expire 24 hours after creation; `purgeExpiredGuests` is invoked by the cron in slice 9.
- Rate limits live in Postgres, keyed by an HMAC of the client address: guest 5/h, email login 10/15 min per
  client and email plus 50/h per email alone (distributed guessing), sign-up 10/h.
- `proxy.ts` only pre-filters on the cookie; the `(app)` layout validates the session and every use case is
  reached through `withActor`.

## Security hardening (review of slice 3)

- **Raw handler.** `/api/auth/[...all]` is an allowlist: only `GET /get-session` and `POST /sign-out` reach
  Better Auth; anything else is a 404. Better Auth also lists sign-in/sign-up/anonymous in `disabledPaths`
  (checked against 1.7.7: it only affects HTTP, `auth.api.*` keeps working). Credential and guest flows exist
  only as use cases, so rate limits, schemas and sandbox provisioning cannot be bypassed.
- **Origin and cookies.** `BETTER_AUTH_URL` is required in production and is the only trusted origin. One
  `SessionCookieConfig` (prefix, `Secure` in production, httpOnly, SameSite=Lax, path /) feeds both Better Auth
  and the proxy. CSRF and origin checks are enabled explicitly because Better Auth skips them in test mode.
- **Client address.** Forwarding headers are spoofable, so they are not trusted by default. On Vercel
  (`VERCEL` set) `x-vercel-forwarded-for`/`x-real-ip` are used; elsewhere `TRUSTED_PROXY_HOPS` (default 0:
  ignore `x-forwarded-for`) selects the entry that many hops from the right. If no address can be determined,
  production refuses the flow with a clear error instead of sharing one global bucket; development and tests
  use a local bucket. The HMAC key is a domain-separated subkey of `BETTER_AUTH_SECRET`.
- **Sign-up enumeration (accepted trade-off).** Registering an existing email answers "Email already
  registered". Hiding it would need email verification (send a mail either way), which is out of scope for v1.
  Mitigation: sign-up is limited to 10/h per client, and login failures are generic. Revisit together with
  email verification and password reset.
- **Credentials policy.** Passwords need at least 10 characters (Better Auth is configured with the same
  constant); emails on the reserved `.invalid` TLD cannot be registered because demo users live there.

## Consequences

- Our rate limiter (Postgres) guards sign-in; Better Auth's built-in limiter is not relied upon.
- Anonymous users are kept on link (`disableDeleteAnonymousUser: true`) so we can move their sandbox to the
  new account first; the TTL cleanup removes the leftover anonymous row.
- Authentication tables are owned by migrations, never by Better Auth's own migrator.
