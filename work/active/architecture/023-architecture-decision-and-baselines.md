---
id: 023
title: Decide module boundaries and record reproducible architecture baselines
status: active
priority: high
type: chore
areas:
  - architecture
  - performance
  - security
created: 2026-08-01
completed:
---

# Goal

Produce the evidence and ADR needed to execute epic 022 without guessing about
module ownership, dependencies, migration order, performance, or external-code
licensing.

# User outcome

The refactor starts from measurable behavior and an agreed design, reducing the
risk of a long rewrite whose regressions are discovered only at the end.

# Scope

- Map frontend and Rust imports, responsibilities, production/test cycles,
  Tauri commands, IPC call sites, watcher events, Git process counts, and shared
  concepts.
- Define the final dependency matrix and public entry point of each module.
- Compare vertical feature slices, technical layers, state subscription
  options, and strangler versus big-bang migration.
- Evaluate every proposed new dependency by benefit, bundle/runtime cost,
  maintenance cost, and the alternative without it.
- Record the GitButler revision studied, its FSL-1.1-MIT restriction, the small
  subsystems inspected, and principles that may be independently reimplemented.
- Record current file/test/command/chunk baselines and a reproducible desktop
  measurement protocol.
- Select numeric warning/failure budgets for startup ordering, entry and screen
  chunks, warmed switch p50/p95, memory after visiting all screens, DOM bounds,
  and Git process counts.
- Define how dependency rules will be checked in CI, including type-only,
  dynamic, and test-only edges.
- Add the ADR under `docs/adr/` and update `docs/ARCHITECTURE.md` only with
  decisions settled here.

# Out of scope

- Moving production modules.
- Adding a state library or dependency guard before its ADR decision.
- Treating GitButler's current folder/crate structure as GitOdrile's target.

# Acceptance criteria

- [ ] ADR records module structure, dependency rules, state approach,
      migration sequence, rejected alternatives, and dependency policy.
- [ ] Dependency map distinguishes production, tests, dynamic imports and
      transport boundaries and identifies every existing cycle.
- [ ] Baseline records exact test counts, 29-command inventory, chunk sizes,
      startup sequence, process counts, screen timings and memory protocol.
- [ ] Numeric budgets and measurement environment are recorded.
- [ ] GitButler research is tied to an exact revision and includes a clear
      no-copy/FSL constraint.
- [ ] Proposed child-task boundaries are confirmed or updated in epic 022.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `work/active/architecture/022-modular-feature-architecture.md`
- `src/main.tsx`
- `src/screens.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Tasks 018–021.

# Decisions

- Architecture enforcement and budgets are designed before production moves.
- External reference use must be traceable by repository revision and license.

# Implementation notes

Record the ADR path, dependency tooling decision, baseline artifacts and exact
GitButler revision inspected.

# Validation

Record commands and desktop measurement protocol; no implementation checks may
be claimed merely from this planning task.
