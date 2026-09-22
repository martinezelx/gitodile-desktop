# ADR 0012: Layer colour tokens into brand and theme, and ship canonical palettes

- Status: accepted
- Date: 2026-09-21
- Amended by: ADR 0013 (themes own the actionable accent; the brand layer is
  identity only) and ADR 0015 (a community theme's toggle returns to the
  device). The layer split, the canonical-palette rule, the preference model
  and the guard tests here still stand; ADR 0014 was superseded by 0015 before
  it shipped.

## Context

GitOdile currently offers one theme decision with three states - `system`,
`light`, `dark`. `ThemePreference` is the union `"system" | "light" | "dark"`
(`src/features/settings/domain.ts`), stored in `localStorage` under
`gitodile-theme` (`src/app/preferences.ts`), and applied by writing
`data-theme` on `<html>`. The colour values live in `src/styles/tokens.css` as a
base light `:root`, an OS-following `@media (prefers-color-scheme: dark)` block,
and two explicit `:root[data-theme="light"|"dark"]` blocks.

The product owner wants a more visual Interface section with several selectable
themes, in the spirit of editors and other desktop clients, while keeping the
current GitOdile Light and Dark as the official pair that follows the system.
Several well-known palettes were requested (Catppuccin in particular) and
throwaway HTML mockups were used to settle the shape.

Two constraints shape this decision:

1. The official themes are GitOdile's own palette. Adding community themes must
   not redefine or dilute the brand colours used by the crocodile mark, the
   primary action, identity avatars, and tooltips.
2. Every added theme must be a real, attributable palette rather than invented
   colours, and it must not break the accessibility contract already stated in
   `DESIGN.md` (4.5:1 for body text, 3:1 for large text, icons, and borders).

The current token contract already contains theme-independent exceptions -
`--tooltip-*` and `--avatar-color-*` are deliberately fixed across light and
dark. That precedent is what makes a two-layer split a small extension rather
than a rewrite.

## Decision

### Two layers, one contract

Split the colour token contract into two layers, declared in one stylesheet:

- **Layer A - brand identity, declared once, never themed:** `--accent-brand`,
  `--accent-brand-contrast`, `--avatar-color-0..7`, `--avatar-foreground`, and
  `--tooltip-*`. No theme may set these, so the mark, the primary action, and
  identity colours survive every palette.
- **Layer B - theme colour tokens, supplied by each theme:** surfaces,
  text, borders, the semantic accent (`--accent-primary*`), `--status-*`,
  `--diff-*`, `--syntax-*`, `--focus-ring`, `--overlay`, and `--shadow-*`.
  Existing token names are kept; no renames.

### A theme is a record, delivered by CSS

- A theme is a record (`id`, display name, `scheme: "light" | "dark"`,
  `source: "official" | "community"`) whose palette fills Layer B only.
- Palettes are delivered as `[data-theme="<id>"]` blocks in a design-system
  stylesheet (for example `src/styles/themes.css`), each setting
  `color-scheme: light | dark` so native scrollbars and form controls follow.
  There is no runtime colour maths; `applyTheme` only changes the attribute.
- The registry of records lives in shared theme code and is what the Settings
  picker renders. Settings owns the preference and the picker UI, not the
  palette values.

### Official records are the source, not a substitution

- `gitodile-light` and `gitodile-dark` are ordinary records carrying the
  current `tokens.css` values verbatim. The brand palette is not replaced by
  community colours; it is simply the palette of the official records.

### Only canonical palettes ship

- A community theme is admitted only when its author publishes a canonical
  palette. Base surfaces, text, and accents are taken from that spec unchanged.
- Where a palette does not define a role GitOdile needs (`--diff-*`,
  `--syntax-*`, and some secondary text), the mapping from palette colours to
  those roles is GitOdile's own and must be documented and contrast-checked.
- Vercel/Geist is **not** admitted: it is a design system, not a canonical
  editor palette, so a "Vercel theme" would be invented colours, contrary to
  this rule. It may return only with an explicit decision to add a separate
  "brand-adapted" class of themes.

### Preference, resolution, and the toggle

- Replace the three-value union with `ThemePreference = "system" | ThemeId`,
  where `"system"` is not a theme and resolves to `gitodile-light` or
  `gitodile-dark` via `prefers-color-scheme`.
- Migrate stored values once: `light` -> `gitodile-light`, `dark` ->
  `gitodile-dark`; anything unknown falls back to `system`. Keep the existing
  eager-default repair behavior for `gitodile-theme = "system"`.
- The titlebar toggle and the command palette keep cycling only the official
  trio (`system` -> `gitodile-light` -> `gitodile-dark`). Community themes are
  selectable in the Interface section only, so the fast path never becomes a
  long cycle.
- The mascot reads the theme record's `scheme` rather than a specific token, so
  it stays correct under any palette.

### Guard the contract

- Add a test that computes contrast for every theme's text/surface pairings at
  4.5:1 and for accent/large-text/border usages at 3:1. A theme that fails is
  not admitted.
- Extend the existing token-contract test so it fails if a Layer B theme block
  sets a Layer A token, if a theme omits `color-scheme`, or if the official
  records drift from the values in `DESIGN.md`.

### Documentation

- Update `DESIGN.md` § Theming to describe the two layers, the record shape,
  and the canonical-palette admission rule.
- Record each admitted community palette and its role mapping in the same
  place, with the palette's canonical source.

## Consequences

- Adding a theme is a CSS record plus a registry entry; it does not touch
  components, because components already consume semantic tokens.
- The brand stays recognisable in every palette, and status colours keep their
  meaning, satisfying the safety rule that a warning can never read as safe.
- A future theme switch is a single `data-theme` attribute change, preserving
  the existing `themeTransition` cross-fade and the reduced-motion path.
- The palette-to-role mapping for community themes is now an explicit,
  reviewable artefact, and it carries an ongoing contrast obligation.
- Theme values must be maintained in both the stylesheet and the documented
  table; the contract test is what keeps them honest.
- Excluding non-canonical palettes (Vercel/Geist) means GitOdile cannot offer
  every requested look without either inventing colours or opening a second,
  clearly-labelled class of themes.

## Alternatives considered

- **Keep the three-value union and bolt themes on as extra attribute values.**
  Rejected: it keeps light/dark special-cased in code and would not give the
  brand/theme separation that protects the mark and the primary action.
- **Let each theme also override `--accent-brand`.** Rejected: it would let a
  community palette recolour the crocodile and the primary action, weakening
  product identity and the "brand moments" rule in `DESIGN.md`.
- **Ship Vercel/Geist as a theme.** Rejected as invented colours; it is a design
  system, not a canonical palette. Left as a possible separate theme class.
- **Compute theme colour values in JavaScript at runtime.** Rejected:
  unnecessary runtime cost and a flash risk, where static `[data-theme]` CSS
  already does the job.
- **Persist the theme through a new native/Tauri store.** Rejected for now:
  the existing `localStorage` key and migration are sufficient and avoid a new
  persistence concern; this can be revisited if preferences move natively.
- **Make the titlebar toggle cycle all themes.** Rejected: a fast toggle should
  stay short; community themes belong in Settings.
