---
id: 031
title: Audit the modular architecture and unlock the History blueprint
status: active
priority: high
type: chore
areas:
  - architecture
  - frontend
  - rust
  - performance
  - security
  - platform
created: 2026-08-01
completed:
---

# Goal

Perform the independent integration audit for epic 022's core architecture,
close migration compatibility gaps, document the resulting structure and prove
that History can be implemented without reopening composition roots.

# User outcome

The refactor finishes with measured confidence rather than file-size claims,
and the next screen can be built from a trustworthy blueprint.

# Scope

- Verify every epic invariant and tasks 023–030 against the final code
  rather than their implementation notes alone.
- Compare dependency graph, file ownership, command contracts, tests, chunks,
  startup ordering, warmed switch p50/p95, memory, DOM bounds and process counts
  with task 023 baselines/budgets.
- Audit all Tauri commands for classification, repository-access mode,
  async/execution policy, caps, cancellation, prompts and redaction.
- Audit close/reopen, linked worktrees, shared-ref invalidation, watcher bursts,
  mutation/read races and remote uncertainty end to end.
- Validate Windows desktop behavior and run available macOS/Linux CI checks;
  document untested WebKit/WKWebView/WebKitGTK risks with owners and follow-ups.
- Confirm Tauri capabilities and CSP remain minimal and no generic command,
  filesystem or event surface was introduced.
- Update `AGENTS.md`, `docs/ARCHITECTURE.md`, ADR consequences and the new-screen
  implementation guide with the final tree and rules.
- Create a minimal throwaway History-shaped test module proving a greenfield
  screen can register, preload, subscribe, invalidate and evict without adding
  workflow logic to `main.tsx` or Rust `lib.rs`; do not implement task 015
  behavior. One declarative entry in a neutral screen/command registry is
  expected and must not be replaced by macros, IoC or dynamic registration
  solely to achieve a literal zero-file-edit claim.
- Remove the test module after the architectural proof unless the ADR chooses a
  permanent fixture.

# Out of scope

- Implementing the History timeline.
- Accepting unexplained regressions because the files are smaller.
- Expanding Tauri permissions for test convenience.

# Acceptance criteria

- [ ] No production dependency cycles or forbidden imports remain.
- [ ] `main.tsx` and Rust `lib.rs` are thin composition roots by the ADR's
      measurable definition.
- [ ] Command/IPC/error compatibility and execution-policy inventories pass.
- [ ] Session epoch, linked-worktree fan-out, hidden lifecycle and direct-IPC
      mutation tests pass end to end.
- [ ] All numeric budgets pass or an explicitly approved ADR/task records the
      regression and mitigation.
- [ ] Windows desktop validation passes; macOS/Linux checks pass where
      available and remaining risks are concrete, owned and bounded.
- [ ] Tauri capability/CSP audit finds no broadened authority.
- [ ] Greenfield screen proof requires no composition-root workflow logic.
- [ ] A new Rust feature needs at most declarative command registration; the
      proof introduces no registry framework or indirection with one consumer.
- [ ] Durable documentation describes ownership, dependency direction,
      execution safety, request lifecycle and screen creation.
- [ ] Full frontend and Rust validation from `AGENTS.md` passes.
- [ ] Epic 022 is marked done and task 015 is unblocked only after tasks
      023–030 and this final audit are complete.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- ADR from task 023
- `work/active/architecture/022-modular-feature-architecture.md`
- outputs of tasks 024–030

# Dependencies

Tasks 023–030. This audit is deliberately last so it validates and closes the
complete epic in one task boundary.

# Decisions

- Epic completion requires independent end-to-end evidence.
- History is unlocked only after a greenfield contract proof, not merely after
  moving existing code.

# Implementation notes

Record every audit result, accepted deviation, cross-platform limitation,
documentation path and final module tree.

# Validation

Run the complete command set from `AGENTS.md`, the task-021 warmed desktop
stress protocol, security/capability review and available platform CI.
