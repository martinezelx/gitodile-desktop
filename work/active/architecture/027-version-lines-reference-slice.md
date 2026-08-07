---
id: 027
title: Migrate Version lines as the reference vertical slice
status: active
priority: high
type: chore
areas:
  - frontend
  - rust
  - branches
  - performance
  - safety
created: 2026-08-01
completed:
---

# Goal

Prove the architecture from Tauri adapter through Rust service and frontend
controller by migrating Version lines without changing discovery, create,
switch or delete behavior.

# User outcome

Version lines behave exactly as before while providing a complete example for
new read and mutation features.

# Scope

- Create a Version-lines frontend feature with UI, controller/store, domain
  types, typed port and Tauri adapter.
- Register its `ScreenModule` through task 026's single path.
- Implement the standard bounded project-snapshot lifecycle: session epoch,
  one in-flight request per query, dedupe, monotonic generation/cancellation,
  stale rejection, cache/no-loading-flash, stable equality, last-snapshot error,
  explicit invalidation and bounded eviction.
- Keep feature-specific equality, tokens and invalidation decisions in the
  feature rather than a catch-all cache.
- Migrate the Rust Version-lines DTOs, parser, planner, service, domain errors
  and tests behind task 024's runner/access boundaries.
- Preserve command names/payloads through task 025's compatibility contracts.
- Keep create/switch/delete previews, common-Git-dir exclusion, dirty-tree
  checks, state tokens and unique-work safety intact.
- Preserve the closed Version-lines interaction contract: search, filters,
  `Local-only first` semantics, viewport-bounded filter content, shared popup
  focus/dismissal behavior, Arrow/Home/End/Escape/typeahead keyboard support,
  and English/Spanish copy.
- Document the reference slice and which parts are mandatory versus
  feature-specific.

# Out of scope

- Renaming Version lines or changing UI/copy.
- History or a general branch graph.
- Generalizing the cache beyond behavior proven here.

# Acceptance criteria

- [ ] Version lines no longer places UI, lifecycle or IPC orchestration in
      `main.tsx`.
- [ ] Its Rust parser/planners/workflows no longer live in `lib.rs`.
- [ ] Concurrent dedupe, mutation supersession, cached unchanged/changed/error,
      project switch and close/reopen epoch tests pass.
- [ ] Watcher worktree/shared-ref invalidation follows task 025's taxonomy.
- [ ] Navigation never invokes a Version-lines command by itself.
- [ ] Create/switch/delete safety and temporary-repository tests remain
      behaviorally equivalent.
- [ ] Related worktrees cannot execute conflicting mutations through direct
      IPC calls.
- [ ] Hidden screen behavior, memory, chunks, switch timings and Git process
      counts satisfy task 023's budgets.
- [ ] Popup, filtering, sorting, keyboard and focus tests remain behaviorally
      equivalent after UI/controller ownership moves.
- [ ] A short implementation guide explains how History should use the proven
      contracts without copying feature-specific policy.

# Relevant files

- `src/versionLines.ts`
- `src/versionLinesPanel.tsx`
- `src/versionLinesDialog.tsx`
- `src/popupMenu.tsx`
- `src/versionLinesPanel.test.tsx`
- `work/done/036-three-screen-closure-audit.md`
- `src/projectSessions.ts`
- `src/main.tsx`
- `src-tauri/src/lib.rs`
- tasks 024–026 outputs

# Dependencies

Tasks 024, 025 and 026.

# Decisions

- Version lines is the full read+mutation pilot because it exercises every
  important boundary.
- Only proven lifecycle mechanics become reusable policy.

# Implementation notes

Record final frontend/Rust paths, public ports, invalidation rules, cache
limits, compatibility results and measurements.

# Validation

Run all Version-lines unit/integration/UI tests, then full required checks.
