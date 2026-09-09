---
id: 037-7
title: Audit the complete conflict workflow
status: active
priority: high
type: audit
areas:
  - conflicts
  - accessibility
  - performance
  - platform
  - testing
created: 2026-08-18
completed:
parent: "037"
queue: "13"
---

# Goal

Independently verify epic 037 from conflict creation through inspect, resolve,
reset, restart, complete, abort, and recovery under real desktop conditions.

# User outcome

Conflict resolution is a reliable product workflow, not a collection of slices
that only pass in isolation.

# Context

This is the closure gate for epic 037 and the prerequisite for task 065-4 to
initiate conflicting integrations in normal product use.

# Scope

- Audit every parent acceptance criterion and conflict class end to end.
- Run large text/line/file-count, binary/structural, cancellation, external edit,
  restart/crash boundary, watcher, linked-worktree, and injected-failure cases.
- Measure lazy load, chunk, first open, typing, scroll, memory release, process
  count, IPC/DOM caps, and normal-screen regressions against recorded budgets.
- Perform keyboard, screen reader, zoom, forced colors, reduced motion, IME,
  RTL-content, locale/theme, narrow layout, and platform-specific audits.
- Fix closure defects or record a concrete blocker; remove development flags and
  enable only the complete supported workflow.

# Out of scope

- New operation variants or initiating non-fast-forward integration.

# Acceptance criteria

- [ ] Every acceptance criterion in epic 037 is checked with linked evidence.
- [ ] An independent end-to-end temporary-repository journey covers resolve,
      reset, restart, complete, abort, recovery, and uncertain outcomes.
- [ ] Performance/accessibility/platform results meet budgets or the epic remains
      open with an explicit blocker.
- [ ] No incomplete resolver affordance ships and normal startup/navigation/
      Changes performance remains within baseline.
- [ ] README, roadmap, ADRs, architecture, IPC, tests, and task notes match the
      delivered behavior and `pnpm run check` passes.

# Relevant files

- `work/active/037-guided-conflict-resolution.md`
- `work/active/conflicts/037-1-conflict-domain-and-recovery.md`
- `work/active/conflicts/037-2-editor-foundation-spike.md`
- `work/active/conflicts/037-3-read-only-conflict-workspace.md`
- `work/active/conflicts/037-4-resolve-text-conflicts.md`
- `work/active/conflicts/037-5-complete-or-abort-merge.md`
- `work/active/conflicts/037-6-non-text-and-structural-conflicts.md`
- `docs/architecture/023-performance-baseline.md`

# Dependencies

Tasks 037-1 through 037-6.

# Decisions

The epic closes only on end-to-end evidence from the complete workflow.

# Implementation notes

Record audit ownership, defects, fixes, retained limitations, measurements, and
whether every parent criterion passed.

# Validation

Record the full command/desktop/platform/accessibility matrix and aggregate
check output.
