---
id: 030
title: Give styles and translations explicit feature ownership
status: active
priority: normal
type: chore
areas:
  - frontend
  - design
  - i18n
created: 2026-08-01
completed:
---

# Goal

Split global CSS and translation monoliths along the proven feature boundaries
without changing visual output, theme ordering, copy or first-paint behavior.

# User outcome

The interface looks and reads exactly the same, while future features can own
their styles and language strings without editing global monoliths.

# Scope

- Split CSS into explicit ordered layers: tokens/base, app shell, shared
  primitives and feature-owned styles.
- Preserve cascade order, specificity, light/dark behavior, reduced motion and
  opaque dense-data surfaces.
- Split translations into typed feature dictionaries/namespaces while
  preserving compile-time English/Spanish parity and `useLanguage` ergonomics.
- Keep core shell labels available synchronously; feature chunks may not show
  untranslated first frames or introduce layout shifts.
- Add parity, missing-key, import-order and representative rendered-copy tests.
- Measure CSS and chunk changes against task 023 budgets.

# Out of scope

- Visual redesign, copywriting changes or adding a locale.
- Replacing the CSS/token system or i18n implementation with a dependency.
- Moving domain/request logic.

# Acceptance criteria

- [ ] `styles.css` and `i18n.tsx` are composition/entry files rather than
      repositories of every feature rule/string.
- [ ] Production CSS ordering is deterministic and documented.
- [ ] English/Spanish parity fails at compile/test time per feature.
- [ ] Core and first feature frames never render translation keys/fallback
      language or shift after a lazy dictionary arrives.
- [ ] Light/dark, reduced motion, narrow/large layouts and dense diff surfaces
      are visually equivalent.
- [ ] CSS and JavaScript chunks satisfy task 023 budgets.

# Relevant files

- `DESIGN.md`
- `src/styles.css`
- `src/i18n.tsx`
- `src/i18n.test.ts`
- feature modules produced by tasks 026–029

# Dependencies

Tasks 026, 027, 028 and 029.

# Decisions

- This mechanical/high-blast-radius migration is outside the architecture
  critical path until feature ownership is proven.
- Core labels remain eagerly available.

# Implementation notes

Record CSS layer order, translation composition, parity mechanism and visual
comparison method.

# Validation

Run i18n/CSS/build checks and desktop visual QA in both themes before the full
frontend suite.
