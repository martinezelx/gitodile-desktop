---
id: 025
title: Contract-test IPC, session identity and watcher invalidation
status: active
priority: high
type: chore
areas:
  - rust
  - frontend
  - repository
  - performance
  - security
created: 2026-08-01
completed:
---

# Goal

Make frontend/backend compatibility and repository freshness explicit through
tested contracts, session incarnations and typed domain invalidation events.

# User outcome

Closing, reopening or switching projects cannot let an old response or watcher
event corrupt the newly active project, including linked worktrees.

# Scope

- Snapshot the Tauri command inventory, argument names, serialized responses
  and structured error codes. Use schema generation only if task 023 justifies
  its dependency; otherwise use Rust serialization fixtures plus TypeScript
  contract tests.
- Introduce an opaque session epoch/incarnation distinct from canonical project
  path. Bind requests, responses, caches, operations and events to it while
  preserving compatibility wrappers for current IPC payloads during migration.
- Define the epoch rollout explicitly: Rust creates or validates the epoch;
  additive/optional compatibility fields may bridge unmigrated consumers, but
  the compatibility path must be inventoried and removed or restricted to
  safe reads once its consumer migrates. By task 029, no mutation may bypass
  epoch validation through a legacy payload.
- Define a typed watcher event envelope containing project identity, session
  epoch, monotonic sequence and domain event kind.
- Replace the ambiguous boolean invalidation with the smallest useful event
  taxonomy, such as worktree, HEAD/ref, shared repository and explicit refresh.
- Keep raw changed paths and repository content in Rust unless a feature has a
  concrete need and bounded safe contract.
- Fan shared ref/remote invalidations out to all open worktrees whose
  `commonGitDir` matches; keep worktree-only changes isolated.
- Coalesce watcher bursts without starvation, preserve event ordering within a
  session, and reject events after unwatch/close/reopen.
- Test listener teardown, watcher replacement, late callbacks and unavailable
  platform watchers.
- Preserve platform-specific watcher path matching: macOS FSEvents may report
  `/private/var/...` for a `/var/...` watch, while Windows canonicalization may
  add a `\\?\` prefix that its watcher does not report. Git-internal churn must
  remain filtered under both representations.

# Out of scope

- Fetching repository data inside the watcher solely because a screen is open.
- Exposing a generic filesystem event stream to the renderer.
- Breaking existing command names or payloads before compatibility consumers
  migrate.

# Acceptance criteria

- [ ] CI fails on accidental command, argument, response or error-code drift.
- [ ] A session epoch, not canonical path alone, gates every migrated response
      and event.
- [ ] Close/reopen of the same path rejects the previous session's response and
      queued watcher event.
- [ ] Worktree changes remain isolated; shared Git/ref changes invalidate all
      related open worktrees exactly once per coalesced burst.
- [ ] Watcher payloads are typed, bounded and contain no raw source content.
- [ ] Sequence/coalescing tests cover long bursts without UI starvation.
- [ ] Current manual refresh behavior remains available when watching fails.
- [ ] Compatibility wrappers have named consumers and a removal task; direct
      IPC mutation cannot use a missing/stale epoch after task 029.
- [ ] macOS and Windows watcher tests prove path aliases do not turn
      `.git/objects`, lock files or other Git churn into repository refreshes.

# Relevant files

- `src-tauri/src/watch.rs`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/projectSessions.ts`
- ADR from task 023

# Dependencies

Task 024.

# Decisions

- Canonical path is project identity; session epoch is open-incarnation
  identity. Both are required.
- Events communicate domain invalidation, not arbitrary filesystem details.

# Implementation notes

Record the contract mechanism, compatibility layer, event taxonomy, sequence
rules and shared-worktree fan-out behavior.

# Validation

Run Rust serialization/watcher tests, TypeScript contract/session tests and the
full frontend/Rust suites.
