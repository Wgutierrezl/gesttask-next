# 0021. Internationalization with next-intl, no URL routing

Status: accepted (i18n, slice 1).

## Context

The UI was English only. It now ships English and Spanish, and the choice must survive without JavaScript, keep the
REST API and OpenAPI document in English, and keep `domain` and `application` pure TypeScript.

## Decision

- **next-intl 4 without locale routing.** URLs stay as they are. `src/i18n/request.ts` resolves the locale per
  request: `locale` cookie, then the first supported primary subtag of `Accept-Language`, then `en`. Every value is
  checked against the `en | es` allowlist (`src/i18n/config.ts`), so an invalid cookie falls through and the dynamic
  catalog import cannot be steered.
- **The cookie is written by a form.** `setLocaleAction` (a Server Action) validates the allowlist and sets an
  `httpOnly`, `SameSite=Lax`, one-year cookie. The switcher is a plain form of submit buttons inside a `<details>`
  Preferences menu, so it works with JavaScript disabled; the client learns the locale from `NextIntlClientProvider`
  and never reads the cookie.
- **Catalogs** are `src/i18n/messages/{en,es}.json`, one namespace per area, typed from `en.json`
  (`global.d.ts`). A parity test requires the same keys, ICU argument names and plural arms in both.
- **`en` formats as en-US** (`INTL_LOCALE`), so English output is byte-identical to the pre-i18n UI.
- **Errors carry reason keys, not translations** (introduced in a later slice). `domain` and `application` emit
  plain-string keys; the web layer translates them at the Server Action chokepoints, from a server-only catalog.
  REST bodies keep their English `message`.
- **`src/i18n` is a leaf** for the server-side layers: dependency-cruiser rule `i18n-is-leaf` forbids `domain`,
  `application`, `infrastructure` and `openapi` from importing it.
- The page `<title>` uses a root template (`%s - GestTask`); pages supply a localized `%s` through `generateMetadata`.

## Consequences

- The whole tree renders per request (it reads cookies and headers); acceptable, the app is already session-bound.
- Unit tests render through `renderWithIntl` (`tests/support/render.tsx`) with the real catalogs, and mock
  `next-intl/server` with `tests/support/intl-server.ts` for async server components.
- `@parcel/watcher` and `@swc/core` (optional tooling of next-intl) have install scripts that are not needed here; both
  are set to `false` in `allowBuilds`.
- Adding a locale means a catalog, a `LOCALES` and `INTL_LOCALE` entry, and a button in the language form.
