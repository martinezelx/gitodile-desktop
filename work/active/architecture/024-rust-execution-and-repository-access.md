---
id: 024
title: Establish safe Rust execution and repository access boundaries
status: active
priority: high
type: chore
areas:
  - rust
  - git
  - security
  - performance
created: 2026-08-01
completed:
---

# Goal

Create the Rust foundation that every domain service uses for repository
identity, concurrency, process execution, errors and diagnostics, while keeping
all public Tauri behavior compatible.

# User outcome

Concurrent or cancelled UI work cannot accidentally overlap incompatible Git
operations, hang indefinitely, consume unbounded output, or expose secrets.

# Scope

- Extract an application/domain API independent of Tauri; leave commands as
  thin validation and delegation adapters.
- Introduce a validated repository context retaining worktree root, Git dir,
  common Git dir, bare state and platform/path facts. Do not rediscover a
  repository inside domain helpers.
- Define path normalization per platform instead of assuming one canonical
  spelling is accepted by every backend. Preserve macOS `/var` versus
  `/private/var` aliases and Windows normal versus `\\?\` path behavior when
  matching repository identities and filesystem events.
- Add a Rust repository-access coordinator keyed by canonical `commonGitDir`:
  shared/read access where safe and exclusive access for mutations.
- Acquire guards at the command/application boundary and pass narrow read/write
  permission evidence downward; detect accidental lock re-entry in tests/debug.
- Preserve state-token validation for external changes and multi-step plans.
- Consolidate Git execution behind argument vectors, explicit working
  directory and deterministic locale without shell interpolation.
- Give each command an execution policy covering operation classification,
  stdout/stderr caps, timeout, cancellation, prompt policy, concurrency and
  diagnostic redaction.
- Distinguish logical stale-response rejection from actual process
  cancellation. Ensure timeout/cancel cleanup handles child processes as safely
  as each supported OS permits and document limitations.
- Preserve hook and signing behavior; do not silently bypass either.
- Keep the public error envelope stable while allowing domain-owned errors to
  convert through one transport error taxonomy.
- Move focused runner/access/error tests with the new owners without weakening
  temporary-repository coverage.

# Out of scope

- Changing command names or serialized payloads.
- Inter-process locking against unrelated Git clients unless separately
  justified; GitOdrile's own in-process safety is required here.
- Migrating every domain out of `lib.rs`; later tasks consume this foundation.
- Moving away from system Git.

# Acceptance criteria

- [ ] Tauri adapters do not contain Git workflows or acquire nested locks.
- [ ] Two worktrees sharing a common Git directory cannot run conflicting
      GitOdrile mutations concurrently even if the frontend calls them directly.
- [ ] Unrelated repositories are not serialized behind one global lock.
- [ ] Read/write coordination, fairness assumptions, cancellation and
      re-entry behavior have focused tests.
- [ ] Every registered process-launching command appears in a checked execution
      inventory with caps, timeout, cancellation and prompt policy.
- [ ] Superseded/cancelled commands cannot accumulate unbounded Git processes.
- [ ] stdout/stderr and diagnostic redaction tests cover remote credentials,
      query tokens, hook output and malformed/non-UTF-8 data.
- [ ] Existing plan, recovery, index restoration, hook and signing tests pass.
- [ ] No shell string is constructed from user or repository data.
- [ ] Windows process behavior passes; macOS/Linux cleanup limitations are
      tested where available or explicitly documented for task 031.
- [ ] Repository/path tests cover platform aliases without introducing a path
      representation that a watcher or command backend cannot match.

# Relevant files

- `src-tauri/src/lib.rs`
- `src-tauri/src/watch.rs`
- `docs/ARCHITECTURE.md`
- `work/active/architecture/022-modular-feature-architecture.md`
- ADR from task 023

# Dependencies

Task 023.

# Decisions

- Rust enforcement is authoritative; frontend mutation blockers remain UX.
- Start with the smallest in-process coordinator appropriate to GitOdrile.
- Domain errors convert into one stable public error envelope.

# Implementation notes

Record module paths, command policy inventory, lock key choice, OS process
cleanup behavior and preserved compatibility details.

# Validation

Run focused runner/access tests, then all Rust checks required by `AGENTS.md`.
