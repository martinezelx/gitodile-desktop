# ADR 0013: Themes own the actionable accent; brand is identity only

- Status: accepted
- Date: 2026-09-21
- Amends: ADR 0012, whose brand-layer scope reserved `--accent-brand` for the
  primary action as well as the mark.

## Context

ADR 0012 split colour into a brand layer (declared once, never themed) and a
theme layer, and reserved `--accent-brand` for "the mark and primary CTA".
Implementing the theme picker exposed the consequence: with a community palette
selected, the surfaces, navigation, focus and status all follow the theme, but
the primary action, the notification badge and the attention halo stayed brand
lime. The result read as a clash rather than a signature — a mauve theme with a
lime "save version" button.

Every full-theme application resolves this the same way. Editors, terminals and
themed chat clients let the theme own the entire workbench palette — buttons,
links, focus and selection — and the brand survives as the mark and in
out-of-content surfaces (the application icon, the installer, the About
surface). Applications that keep a brand accent either skin only a sub-region
or expose a separate accent preference; they do not let a brand accent sit
inside themed content beside a different theme accent.

## Decision

- The **theme owns the actionable accent**. `--accent-primary`,
  `--accent-primary-fill` and `--accent-primary-contrast` are the colours of the
  primary action, the notification/status badge, and the attention halo.
  Components use these tokens, never `--accent-brand`.
- The **brand layer is identity only**: `--accent-brand` and
  `--accent-brand-contrast` remain the fixed lime for brand surfaces outside the
  themed workbench (the packaged application icon and the brand lockup), plus
  the already-fixed `--avatar-color-*` and `--tooltip-*`.
- The **crocodile mark keeps following the theme accent** (`--accent-primary`),
  as it already did, so the identity is the silhouette rather than a colour that
  fights the palette. The official themes keep the brand look because their
  `--accent-primary-fill` is the brand lime.
- The guard from ADR 0012 stands unchanged: a `[data-theme]` block still must
  not set a brand-layer token. `themeContrast.test.ts` now also covers
  `--accent-primary-contrast` on `--accent-primary-fill`, which is what a
  primary action actually renders.

## Consequences

- Community themes are coherent: one accent drives actions, navigation, focus
  and badges.
- GitOdile Light and Dark look unchanged, because their accent fill is lime.
- `--accent-brand` no longer appears in the themed workbench; it is a brand
  constant for packaged/identity surfaces. A reviewer should treat a new
  in-app use of it as the regression this ADR exists to prevent.
- A future "separate accent preference" (theme plus an independently chosen
  accent) remains possible but is out of scope.

## Alternatives considered

- **Let themes override `--accent-brand`.** Minimal change, but it turns the
  brand token into a themed token and invites the same clash in reverse. The
  accent is the concept; brand is a fixed identity value.
- **Keep the lime as a deliberate signature in every theme.** Rejected by the
  product owner after seeing it: it reads as a clash, not a signature, and no
  mainstream themed app does it.
- **Give the crocodile mark its own fixed brand colour.** Rejected: on the light
  surface the lime measures 1.95:1 and the mark all but disappears (see
  DESIGN.md § Brand and mascot), and a fixed-colour logo beside a theme accent
  reintroduces the clash.
