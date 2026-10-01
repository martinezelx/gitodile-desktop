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

# Scope

- Write the conflict-session/recovery ADR, including operation roles, ownership,
  restart, linked worktrees, retention, privacy, and incomplete evidence.
- Parse/classify every in-scope unmerged-index shape and active merge state.
- Define typed session, file summary, allowed-action, snapshot, state-token,
  error, and invalidation contracts.
- Read stage object metadata/content lazily within explicit process/IPC caps.
- Create and verify a durable pre-mutation snapshot format for unmerged index
  stages plus working content/mode; this slice does not restore or mutate it.

# Out of scope

- Editor choice, frontend workspace, writing resolutions, staging, completion,
  abort, or non-merge operation variants.

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

- `work/active/037-guided-conflict-resolution.md`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/status.rs`
- `src-tauri/src/repository_access.rs`

# Dependencies

Tasks 022–031 complete, as recorded by the parent epic.

# Decisions

The ADR produced here is the gate for all later conflict mutations.

# Implementation notes

Record object/stage parsing, token inputs, snapshot layout, caps, and fixtures.

# Validation

Record focused Rust/unit/integration commands and exact platform coverage.
