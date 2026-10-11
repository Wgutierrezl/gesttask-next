# ADR 0020: A token-based design system with local primitives

Status: accepted (UI redesign, slice 1).

## Context

The UI was styled with ad-hoc Tailwind classes per component (grays, `rounded`, no shared scale). The redesign needs one
visual language across landing, auth, boards and the Kanban, without changing what the e2e and unit tests rely on:
accessible names, roles and heading levels.

## Decision

- Tokens live in `src/app/globals.css` under Tailwind 4 `@theme`: a blue-to-indigo `brand` ramp, semantic
  `success`/`warning`/`danger` colors, radii, shadows, easing and two CSS-only animations. Neutrals use Tailwind slate.
  Light theme only for now; a dark theme is future work and would add semantic surface variables at that point.
- Primitives (`Button`, `LinkButton`, `Card`, `Field`/`Input`/`Select`/`Textarea`/`Alert`, `Badge`, `EmptyState`,
  `Avatar`, `PageHeader`, `Dialog`) live in `src/components/ui` and import nothing from the domain, so dependency-cruiser
  stays green. `SubmitButton` keeps its API and is rebuilt on `Button`.
- `Dialog` uses the native `<dialog>` and `showModal()`: focus trap, Esc and focus return come from the browser, no new
  dependency.
- Font: Geist Variable (SIL OFL 1.1) committed as woff2 and loaded with `next/font/local`, so builds and CI never reach a
  font CDN.
- Icons: `lucide-react`, pinned to an exact version, imported per icon. Decorative icons are `aria-hidden`; icon-only
  buttons carry an `aria-label`.
- `prefers-reduced-motion: reduce` collapses all animations and transitions globally.

## Consequences

- Restyling is class-only: ARIA names, roles and heading levels are frozen and covered by the existing tests.
- Adding a color means adding a token, not a hex literal in a component.
- One extra font file (~70 KB) lives in the repository.
