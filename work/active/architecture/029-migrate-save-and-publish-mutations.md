---
id: 029
title: Migrate save and publish mutation flows behind safe domain boundaries
status: active
priority: high
type: chore
areas:
  - frontend
  - rust
  - save
  - sync
  - recovery
  - security
created: 2026-08-01
completed:
---

# Goal

Move the existing Save version and Publish changes workflows onto the modular
architecture without weakening preview, recovery, concurrency or uncertain
remote outcome handling.

# User outcome

Saving and publishing remain predictable and recoverable even when background
refreshes, linked worktrees or slow remote operations overlap the UI.

# Scope

- Create owned frontend feature controllers/ports and Rust application/domain
  modules for existing save and publish behavior.
- Keep operation planning separate from execution and bind both to repository
  identity, session epoch and immutable state token.
- Enforce mutation exclusion in Rust by common Git directory; frontend
  blockers continue to explain conflicts before invocation.
- Define how watcher events are suppressed/coalesced during planning,
  execution, verification, uncertain, error and success phases.
- Let successful mutation results update relevant caches directly and
  supersede older reads before issuing any necessary follow-up invalidation.
- Preserve temporary-index behavior, exact index restoration, recovery paths,
  selected-file semantics, hooks, signing and structured failures.
- Preserve remote selection, upstream behavior, authentication/timeout/
  rejection classification, no-terminal-prompt behavior and publish
  uncertainty.
- Keep current command names/payloads compatible.

# Out of scope

- Implementing task 013 or 014 remote features.
- Adding force push, history rewriting or silent conflict resolution.
- Changing save/publish UI or vocabulary.

# Acceptance criteria

- [ ] Save/publish UI and request orchestration no longer live in `main.tsx` or
      generic shell code.
- [ ] Rust planners/workflows no longer live in `lib.rs`.
- [ ] Direct concurrent IPC mutations against related worktrees serialize or
      fail safely under the Rust coordinator.
- [ ] Stale session epochs and state tokens reject execution before mutation.
- [ ] Mutation results supersede older discovery reads and invalidate every
      affected feature exactly once.
- [ ] Cancel/timeout behavior does not claim a remote mutation failed when its
      outcome is uncertain.
- [ ] Hook/signing failures, index byte restoration, recovery behavior and
      publish uncertainty tests remain equivalent.
- [ ] No credential or authenticated remote URL appears in logs/errors.
- [ ] Git process counts and UI responsiveness satisfy task 023's budgets.

# Relevant files

- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/publish.ts`
- `src/publishDialog.tsx`
- `src/main.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Tasks 027 and 028.

# Decisions

- Mutation safety is enforced in Rust and explained in frontend.
- Cancellation of remote work must preserve an explicit uncertain outcome when
  the remote may already have accepted the change.

# Implementation notes

Record planner/executor boundaries, lock scopes, invalidations, cancellation
semantics and compatibility results.

# Validation

Run focused mutation and temporary-repository tests, then all required checks.
