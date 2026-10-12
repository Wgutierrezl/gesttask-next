# 0022. Light and dark themes through semantic tokens

Status: accepted (i18n and theme, slice 2). Extends ADR 0020, whose design system was light only.

## Context

The UI needs a dark theme that follows the OS by default, can be pinned by the visitor, works without JavaScript and
does not flash the wrong palette on first paint.

## Decision

- **Semantic tokens, not `dark:` variants.** `globals.css` defines CSS variables (`--canvas`, `--surface`, `--fg`,
  `--border`, `--ring`, `--brand-soft`, ...) in `:root` (light) and exposes them to Tailwind with `@theme inline`
  (`bg-surface`, `text-fg-muted`, `border-border`, ...). Components name a role, never a shade, so one class works in
  both themes. Components that still use palette classes (`slate-*`, `bg-white`) do not follow the theme: they are broken in dark
  (light surfaces, dark text) until the migration slices land. That is accepted because the slices reach `main` together as one chain.
- **Two ways to get dark, one set of values.** `:root[data-theme="dark"]` pins it; the same declarations sit in
  `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"]):not([data-theme="dark"])`, which is what
  `system` resolves to. CSS cannot share the block between a selector and a media query, so a unit test fails when the
  two drift. Each block sets `color-scheme` so native controls and scrollbars follow.
- **A cookie, read on the server.** `theme` is `light | dark | system` (absent means `system`). `setThemeAction`
  validates the allowlist and stores it like the locale cookie (`httpOnly`, `SameSite=Lax`, one year, `secure` from
  `x-forwarded-proto`). The root layout renders `<html data-theme>`: the first paint is already right, so no inline
  script is needed and CSP stays strict. The switch is a plain form in the Preferences menu and works without JS.
- **Elevation changes with the theme.** Shadows barely read on dark surfaces, so `--elev-card` and `--elev-pop` get
  stronger alpha in dark, and elevated surfaces (menus, dialogs) also carry a 1px border. The dialog backdrop, the
  focus ring and the hero grid are tokens too.
- **Light stays as it was.** Tokens are chosen so light renders like the pre-theme UI (`fg-strong` is slate-700 for
  labels and ghost buttons, `surface-hover`, `border-subtle`, `accent`, `icon-*` and `elev-dialog` exist for that).
  Intentional differences, all accessibility fixes: `fg-subtle` is `#5b6b82` (slate-500 was 4.3:1 on the muted
  surface); form controls, secondary buttons and the Preferences button use `border-control` (`#7b8aa0`) so their
  boundary reaches 3:1 instead of slate-300's 1.5:1; the light dialog backdrop is black at 60%, as before.
- **Contrast is tested.** `tests/unit/theme-tokens.test.ts` computes WCAG ratios from the token values: text tokens
  4.5:1 on canvas, surface, elevated and muted surface; tone text on its soft background 4.5:1; the focus ring, accent
  and control borders 3:1; white on the brand gradient and the danger fill, read from the CSS, 4.5:1.

## Consequences

- Migrating a component is a class swap with no logic change; remaining directories move in later slices, guarded by
  `tests/unit/theme-migration.test.ts`, which forbids raw palette classes in migrated files.
- Until the last slice lands, unmigrated screens look light-on-dark inconsistent when dark is chosen.
- A cookie makes the whole tree dynamic, which it already was because of the locale cookie.
