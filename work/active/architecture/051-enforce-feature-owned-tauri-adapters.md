---
id: 051
title: Enforce feature-owned Tauri adapters
status: active
priority: normal
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-12
completed:
---

# Goal

Move Overview's saved-version detail IPC behind its own typed adapter and make
the frontend architecture guard reject future feature code that imports Tauri
outside an adapter.

# User outcome

No visible change. Repository reads remain testable and future feature work
cannot quietly bypass the port/adapter boundary the architecture promises.

# Context

`src/features/overview/pendingVersionDetails.ts` currently owns three concerns:

- the `PendingVersionDetailsPort` contract;
- the React request/state hook;
- the production implementation, including two direct `invoke` calls.

The interface makes the hook substitutable, but the production boundary still
contradicts `AGENTS.md` and `docs/architecture/frontend-feature-guide.md`:
features reach Rust through a typed port and `tauriAdapter.ts`, and visual/domain
modules do not import Tauri directly.

The working architecture guard did not report this because it protects feature
ownership, cycles, test-only imports and the deferred icon path, but has no rule
for renderer transport imports. A move without a guard would repair the current
file while leaving the same silent regression available to the next feature.

# Scope

- Separate Overview's saved-version detail port from its React lifecycle and
  put the two `invoke` implementations in
  `src/features/overview/tauriAdapter.ts` (or another single adapter file if the
  feature already needs one public adapter composition).
- Keep `CommitFileChange`, `FilesState`, `DiffState` and the read argument/result
  types with the module that owns their meaning; do not duplicate wire shapes.
- Inject the typed production adapter into `usePendingVersionDetails` without
  changing its session-epoch behavior, loading/error states or public UI.
- Export only the capability needed by cross-feature/app consumers through
  `src/features/overview/index.ts`; keep adapter internals private where no
  external consumer exists.
- Extend `scripts/check-frontend-architecture.mjs` so a production module under
  `src/features/<owner>/` may import `@tauri-apps/api` only from that feature's
  designated `tauriAdapter` module. Tests may mock Tauri without being treated
  as production.
- Add both a seeded architecture fixture and a `src`-shaped unit test proving
  the new rule fails with an owning-module diagnostic.
- Sweep every production feature import of `@tauri-apps/api` and confirm all
  remaining imports are in typed adapters. Do not move app-owned watcher,
  window or session lifecycle wiring from `main.tsx`/`bootstrap.tsx`.
- Re-measure the entry and affected lazy chunks to prove the ownership move did
  not create a new static path to `fileIcons` or otherwise break a bundle
  budget.

# Out of scope

- Moving the app composition root's watcher/session/window calls; ADR 0003
  assigns those to the composition root.
- Changing the two IPC command names or their checked payloads.
- Redesigning pending-version expansion or moving the diff renderer; task 048
  owns that boundary.
- Broadening the guard to enforce the entire Rust dependency matrix; this task
  protects the concrete frontend transport escape it fixes.

# Acceptance criteria

- [ ] `pendingVersionDetails.ts` and every other non-adapter production feature
      module contain no `invoke` call and no `@tauri-apps/api` import.
- [ ] Overview's saved-version detail reads use a typed port implemented by its
      feature-owned Tauri adapter, with every request still carrying the
      project id and session epoch.
- [ ] A seeded forbidden transport import makes
      `pnpm run check:architecture` fail with the feature owner and expected
      adapter boundary in the message.
- [ ] A `src`-shaped unit test covers the rule, and production-to-test behavior
      remains unchanged.
- [ ] The guard passes over the real module graph with no new allowance entry.
- [ ] Entry and feature chunks remain within task-023 budgets and `fileIcons`
      stays off the static entry path.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/overview/pendingVersionDetails.ts`
- `src/features/overview/index.ts`
- `src/features/overview/PendingVersionsSection.tsx`
- `scripts/check-frontend-architecture.mjs`
- `scripts/architecture-fixtures/`
- `src/architectureGuard.test.ts`
- `docs/architecture/frontend-feature-guide.md`

# Dependencies

Task 049, so the rule is implemented against dependency-cruiser's native
TypeScript graph rather than the retired TypeScript 7 workaround.

Task 043 runs after this task and records the adapter location and executable
rule in the final architecture documentation.

# Decisions

- Fix and enforce in the same task. A boundary that is repaired but not made
  executable is the failure mode tasks 047 and 049 just exposed.
- Scope the exception to app-owned composition files, not to arbitrary root
  modules. Feature transport belongs in its adapter even when it is not called
  directly from a JSX component.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set and record the architecture guard's
seeded failure plus the production bundle sizes.

