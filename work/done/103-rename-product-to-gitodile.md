---
id: 103
title: Rename the product and application to GitOdile
status: done
priority: high
type: chore
areas:
  - branding
  - frontend
  - desktop
  - documentation
created: 2026-09-02
completed: 2026-09-02
parent:
queue: "19"
---

# Goal

Rename the product and shipped desktop application from GitOdrile to GitOdile
without losing existing preferences or making recovery evidence unreachable.

# User outcome

The application, executable, package metadata, interface, diagnostics, and
documentation consistently use the internationally legible GitOdile name.
An existing pre-release installation retains its settings and local safety
records when updated.

# Context

The user selected GitOdile because it is the direct `Crocodile` → `GitOdile`
wordplay and is not anchored to the Spanish spelling `cocodrilo`. A preliminary
availability search found no exact public name conflict, but the Git trademark
policy requires permission for portmanteau product names. This implementation
records that unresolved release concern; it does not claim trademark clearance.

Branding strings and technical identifiers currently span React copy, Rust
diagnostics, npm/Cargo/Tauri metadata, native probes, local-storage keys,
temporary ownership markers, and versioned recovery namespaces. A blind
replacement would either reset the desktop application's platform identity or
orphan existing preferences and recovery records.

# Scope

- Rename every user-visible product reference to GitOdile in English and
  Spanish UI, diagnostics, metadata, tests, and current documentation.
- Rename npm/Cargo package names, the Rust library crate, executable references,
  CSS classes, and the production SVG asset to `gitodile` forms.
- Move newly written browser preferences to `gitodile-*` keys and migrate
  existing `gitodrile-*` values before the first render without overwriting a
  newer value.
- Rename temporary and operation-owned artifacts that do not carry durable user
  data, while continuing to reject legacy reserved marker names.
- Keep the existing Tauri bundle identifier and version-1 recovery storage
  namespaces stable, documenting them as compatibility identifiers rather than
  product branding.
- Update scripts, active work, historical documentation, and architecture
  references where the current product name is intended.

# Out of scope

- Renaming the GitHub repository, its remote URL, or the local workspace folder;
  those are external/container operations rather than application changes.
- Claiming trademark approval or publishing a release before written clearance.
- Selecting or integrating the unfinished task-102 mascot refinement.
- Redesigning the logo, palette, layout, or product vocabulary.

# Acceptance criteria

- [x] Shipped UI, Rust diagnostics, package metadata, executable, and current
      documentation say GitOdile rather than GitOdrile.
- [x] The npm package, Cargo package/library, CSS brand class, and SVG filename
      use `gitodile` consistently and compile on case-sensitive platforms.
- [x] Startup copies legacy `gitodrile-*` browser values to their `gitodile-*`
      equivalents only when the new key is absent, with focused tests.
- [x] The stable bundle identifier and recovery-v1 namespaces remain readable
      and are explicitly identified as legacy compatibility contracts.
- [x] New temporary clone/init/index artifacts use `gitodile`; both old and new
      reserved initialization-marker names remain rejected.
- [x] Task 102's uncommitted comparison assets and production-selection boundary
      remain intact.
- [x] `pnpm run check` passes.

# Relevant files

- `package.json`
- `src/bootstrap.tsx`
- `src/app/branding.tsx`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/recovery/history.rs`
- `src-tauri/src/recovery/discard.rs`
- `README.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`

# Dependencies

None. Task 102 remains an independent, user-reviewed visual refinement and is
not required for a textual/technical rename.

# Decisions

**Keep stable compatibility identities.** `app.gitodrile.desktop`,
`refs/gitodrile/recovery/v1/...`, and `.git/gitodrile/...` remain unchanged.
The first keeps an update attached to the same installed application identity;
the latter two are versioned safety records whose discoverability is more
important than cosmetic consistency.

**Migrate browser storage before render.** New code writes `gitodile-*`. Startup
copies every legacy-prefixed entry whose destination is absent, preserving a
newer value and retaining the old copy for rollback safety.

**Do not rename external containers implicitly.** The current checkout folder
and GitHub repository can be renamed separately after this change, with their
own external-state confirmation and redirect/remote handling.
Until then, application links continue to target the existing
`project-gitodrile` repository rather than a destination that does not exist.

# Implementation notes

- Renamed product copy, translations, diagnostics, npm/Cargo metadata, Rust
  crate/executable references, CSS brand hooks, scripts, current documentation,
  and the production SVG path to GitOdile/`gitodile`.
- Added a pre-render browser-storage migration that copies legacy-prefixed
  values without overwriting current values and retains the source entries for
  rollback safety.
- Kept the Tauri bundle identifier and recovery-v1 filesystem/ref namespaces
  unchanged, and documented why they are compatibility contracts rather than
  visible branding.
- Moved transient clone, initialization, and index ownership names to the new
  prefix while continuing to reject both generations of reserved init names.
- Updated task 102's reference to the renamed production asset without choosing
  a candidate or changing its comparison artwork.
- Recorded the unresolved Git trademark-permission requirement in product
  strategy; the rename does not claim release clearance.
- The pre-commit review retained the real `project-gitodrile` issue URL until
  the external repository is renamed, and caught the final nine legacy product
  strings in team-update diagnostics.

# Validation

- `pnpm exec vitest run src/app/brandMigration.test.ts
  src/app/aboutDialog.test.tsx src/app/appShell.test.tsx
  src/i18n/frames.test.tsx` — passed, 4 files and 20 tests.
- `pnpm run typecheck` — passed.
- `pnpm run check:docs` — passed after moving this task to `work/done/`, over
  158 Markdown files and 124 task ids.
- Two focused Rust regression tests for the retained history-recovery namespace
  passed after correcting stale test-only expectations.
- `pnpm run check` — passed: documentation and architecture checks (332
  modules), TypeScript, 70 frontend files with 619 tests, production build,
  Rust formatting, Clippy, and 319 Rust tests.
