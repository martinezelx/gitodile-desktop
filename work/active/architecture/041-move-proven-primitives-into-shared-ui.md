---
id: 041
title: Move proven shared primitives into shared/ui
status: active
priority: normal
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-10
completed:
---

# Goal

Apply ADR 0003's own admission rule to the primitives that already satisfy it,
so `shared/ui` holds the shared UI rather than only a stylesheet.

# User outcome

No visible change. Feature authors get one place to look for a proven primitive
instead of guessing between the repository root and a feature directory.

# Context

ADR 0003 says repeated cross-feature UI "moves to `shared/ui` only after two
real consumers have the same stable requirement", and assigns `shared/ui`
"stable, behavior-free UI primitives" behind "explicit named exports".
`docs/ARCHITECTURE.md` shows `shared/ui/` as a module in the delivered tree.

`src/shared/ui/` contains exactly one file: `primitives.css`. Every primitive
sits at the repository root. Measured production consumers, excluding tests:

| Module | Consumers |
| --- | ---: |
| `src/autoHideScrollbar.ts` | 7 |
| `src/appError.ts` | 7 |
| `src/modalFocus.ts` | 4 |
| `src/loadingBar.tsx` | 3 |
| `src/popupMenu.tsx` | 2 |
| `src/tooltip.tsx` | 1 |
| `src/projectAvatar.ts` | 1 |

Five modules are past the ADR's stated bar. The rule was written in task 023 and
never applied, for the same reason Overview and Settings survived: no task owned
it.

`appError.ts` is the interesting case. It is error localization, not a visual
primitive — it maps structured Rust errors to copy. It is shared plumbing that
belongs with the i18n runtime rather than with UI primitives, and putting it in
`shared/ui` to satisfy a consumer count would be exactly the miscellaneous
dumping ground ADR 0003 forbids.

`tooltip.tsx` and `projectAvatar.ts` have one consumer each and stay where they
are. Moving them would contradict the same rule this task exists to apply.

# Scope

- Move `autoHideScrollbar.ts`, `modalFocus.ts`, `loadingBar.tsx` and
  `popupMenu.tsx` into `src/shared/ui/` with an `index.ts` exposing explicit
  named exports.
- Decide `appError.ts` deliberately: `shared/i18n` is the better home. Record
  the reasoning in the task rather than moving it by consumer count.
- Update importers. Features import the public entry point, never a file inside
  it.
- Leave `tooltip.tsx` and `projectAvatar.ts` at the root and say why in the
  implementation notes, so the next reader does not think they were missed.
- Extend `scripts/check-frontend-architecture.mjs` so a feature importing a
  `shared/ui` internal file instead of its entry point is a violation, matching
  the existing feature-internal rule.

# Out of scope

- Changing any primitive's behavior, props or styling.
- Moving `primitives.css` or reordering `src/styles.css`. Task 030's cascade
  order is tested and this task must not disturb it.
- Promoting a one-consumer module.

# Acceptance criteria

- [ ] `shared/ui` exposes its primitives through one `index.ts` with named
      exports.
- [ ] No production file imports a `shared/ui` internal path.
- [ ] The architecture check fails a seeded `shared/ui` internal import, proven
      by its own self-test the way the feature-to-app edge already is.
- [ ] `appError.ts` has a recorded owner and a reason.
- [ ] Modules left at the root have a recorded reason.
- [ ] Chunk budgets unchanged; `fileIcons` still has no static entry path.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/shared/ui/`, `src/shared/i18n/`
- `src/autoHideScrollbar.ts`, `src/modalFocus.ts`, `src/loadingBar.tsx`,
  `src/popupMenu.tsx`, `src/appError.ts`
- `scripts/check-frontend-architecture.mjs`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`

# Dependencies

None. Task 046 depends on this one for the CSS ownership question.

# Decisions

- Consumer count admits a module to `shared/`; it does not decide which
  `shared/` module it belongs to. `appError` is plumbing, not a UI primitive.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set.
