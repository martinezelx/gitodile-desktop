---
id: 037-1
title: Establish conflict truth and durable recovery
status: active
priority: high
type: architecture
areas:
  - conflicts
  - rust
  - recovery
created: 2026-08-18
completed:
parent: "037"
queue: "01"
---

# Goal

Define and prove the backend conflict-session contract before any editable UI
can mutate conflicted files or the index.

# User outcome

GitOdile can recognize an interrupted merge accurately, preserve its original
state, and expose bounded current/incoming/base evidence without changing it.

# Context

This is slice 1 of epic 037. Index stages and operation markers are authoritative;
working-tree conflict markers are not.

GitOdile's own integration (task 161,
[ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md))
forecasts with `git merge-tree` and builds merge versions with
`git commit-tree`, so it never leaves a paused `git merge`, and it refuses real
overlaps. Merges started outside GitOdile (a terminal, an editor, a coding
agent) do leave one. The ADR must cover both.

# Scope

- Write the conflict-session/recovery ADR, including operation roles, ownership,
  restart, linked worktrees, retention, privacy, and incomplete evidence.
- Decide in that ADR how an overlap GitOdile detects (task 161 now, task 065-4
  next) becomes a resolvable session: start a real `git merge` that pauses, or
  build the session from `merge-tree` output. State the consequences for hooks
  (ADR 0030 runs merge hooks through `git hook run`), recovery refs, and abort.
- Keep the snapshot compatible with the recovery-center seed in
  [`ROADMAP.md`](../../docs/ROADMAP.md#design-seeds-in-100): a record whose
  origin may be outside GitOdile.
- Parse/classify every in-scope unmerged-index shape and active merge state.
- Detect, read-only, a paused rebase, cherry-pick or revert and unmerged entries
  with no operation marker, with their step and roles where Git exposes them,
  so task 037-3 can explain them (epic 037 §1b). No mutation contract for them.
- Define typed session, file summary, allowed-action, snapshot, state-token,
  error, and invalidation contracts.
- Read stage object metadata/content lazily within explicit process/IPC caps.
- Create and verify a durable pre-mutation snapshot format for unmerged index
  stages plus working content/mode; this slice does not restore or mutate it.

# Out of scope

- Editor choice, frontend workspace, writing resolutions, staging, completion,
  abort, or any mutation for non-merge operation variants.

# Acceptance criteria

- [ ] ADR and typed domain cover roles, origin, state, recovery, lifecycle, and
      every conflict class in epic 037 without source-content logging.
- [ ] Opening/refreshing a session is read-only and session/ref/index/state-token
      stale checks are proved with temporary repositories.
- [ ] Snapshots are collision-safe, durable, versioned, bounded, restart-safe,
      and preserve incomplete/unreadable evidence.
- [ ] Linked-worktree ownership and common-repository locking are tested.
- [ ] IPC/policy/architecture tests and focused Rust checks pass.

# Relevant files

- [Epic 037](037-guided-conflict-resolution.md)
- [ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md)
- `src-tauri/src/recovery/`
- `src-tauri/src/sync/`
- `src-tauri/src/status.rs`
- `src-tauri/src/index.rs`
- `src-tauri/src/repository_access.rs`

# Dependencies

None open; the modular architecture (tasks 022–031) is complete.

# Decisions

The ADR produced here is the gate for all later conflict mutations.

# Implementation notes

Record object/stage parsing, token inputs, snapshot layout, caps, and fixtures.

# Validation

Record focused Rust/unit/integration commands and exact platform coverage.
