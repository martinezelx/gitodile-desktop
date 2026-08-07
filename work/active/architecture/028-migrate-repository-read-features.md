---
id: 028
title: Migrate repository, status, changes and diff read features
status: active
priority: high
type: chore
areas:
  - frontend
  - rust
  - repository
  - status
  - changes
  - performance
created: 2026-08-01
completed:
---

# Goal

Move the established read-only repository features onto the architecture
proven by Version lines while retaining batching, virtualization and freshness.

# User outcome

Opening projects, reading status and reviewing diffs remain responsive and
truthful while their implementation gains clear ownership.

# Scope

- Migrate repository discovery/identity, working-tree status, pending-version
  summaries, changed-file lists and diff caches into owned frontend/Rust
  modules.
- Reuse task 027's lifecycle mechanics without forcing feature-specific tokens,
  equality or eviction into a generic abstraction.
- Preserve project/session epoch isolation and worktree versus shared-repository
  invalidation.
- Keep Git reads batched and bounded; never one process per visible row.
- Keep large diff output caps, binary/large/malformed states and virtualization.
- Preserve cached content during background refresh and stable identity for
  unchanged snapshots.
- Move the full working-tree diff warm-up out of the Changes component. Project
  activation or repository invalidation owns it, speculative execution is
  idle-deferred, and the screen only consumes the bounded cache.
- Move focused parsers/tests with their owning Rust domains and keep Tauri
  adapters thin.

# Out of scope

- Save, publish or another mutation flow.
- History implementation.
- UI redesign or copy changes.

# Acceptance criteria

- [ ] Repository/status/changes/diff lifecycles no longer live in `main.tsx` or
      visual components.
- [ ] Corresponding parsers/workflows no longer live in Rust `lib.rs`.
- [ ] Repeated navigation performs no repository IPC calls.
- [ ] First arrival at Changes does not start `read_working_tree_diffs`; the
      session runtime warms or invalidates that cache independently of screen
      visibility and retains the batching/output bounds measured in task 023.
- [ ] Watcher bursts coalesce and refresh only the affected feature scopes.
- [ ] Close/reopen and project-switch success/failure races are covered.
- [ ] Diff caches are bounded, released on epoch eviction and never return a
      different project's content.
- [ ] Long lists and diffs retain bounded DOM/process/output work.
- [ ] Existing parser and temporary-repository scenarios remain equivalent.
- [ ] Performance and process counts stay within task 023's budgets.

# Relevant files

- `src/repositoryOverview.ts`
- `src/changes.tsx`
- `src/diffCache.ts`
- `src/pendingVersions.tsx`
- `src/main.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Task 027.

# Decisions

- Share lifecycle protocol, not domain equality or cache keys.
- Dense repository data remains on opaque, virtualized surfaces.

# Implementation notes

Record module ownership, batching/process counts, cache bounds and preserved
exceptional states.

# Validation

Run focused frontend/parser/integration tests, stress large diffs/lists, then
all required checks.
