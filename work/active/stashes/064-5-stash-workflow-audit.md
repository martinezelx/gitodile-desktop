---
id: 064-5
title: Audit the complete set-aside workflow
status: active
priority: high
type: audit
areas:
  - changes
  - recovery
  - conflicts
  - accessibility
  - performance
  - platform
created: 2026-08-18
completed:
parent: "064"
queue: "15"
---

# Goal

Independently verify epic 064 across discovery, creation, restoration,
conflicts, removal, Undo, restart, interoperability, and linked worktrees.

# User outcome

Changes saved for later behave as one reliable lifecycle rather than a set of
individually tested operations.

# Context

This is the closure gate for epic 064 and must audit the parent criteria without
weakening ignored-file, index, recovery, stale-plan, or uncertainty guarantees.

# Scope

- Exercise every parent acceptance criterion and required test/audit scenario.
- Stress 0/1/100/1,000 stashes and large file/diff sets within process, IPC,
  memory, lazy-chunk, interaction, and DOM budgets.
- Verify external Git/client interoperability, linked worktrees, watcher bursts,
  project/session changes, restart/crash boundaries, and injected failures.
- Complete keyboard, screen-reader, focus, locale/theme, narrow layout, reduced
  motion, and 200% zoom audit.

# Out of scope

- New stash capabilities or automatic use from other workflows.

# Acceptance criteria

- [ ] Every epic-064 criterion has linked automated or actual desktop evidence.
- [ ] End-to-end create/inspect/restore/conflict/Undo/remove/Undo/restart journeys
      preserve exact intended bytes, index state, ignored files, and evidence.
- [ ] Performance/accessibility/platform/interoperability results meet budgets
      or the epic remains open with a concrete blocker.
- [ ] No incomplete mutating affordance ships.
- [ ] ADRs, IPC, architecture, README, roadmap, tasks, and tests match behavior;
      `pnpm run check` passes.

# Relevant files

- `work/active/064-set-changes-aside-safely.md`
- `work/active/stashes/064-1-discover-saved-sets.md`
- `work/active/stashes/064-2-set-changes-aside.md`
- `work/active/stashes/064-3-restore-saved-set.md`
- `work/active/stashes/064-4-remove-and-recover-saved-set.md`
- `docs/architecture/023-performance-baseline.md`

# Dependencies

Tasks 064-1 through 064-4.

# Decisions

Epic 064 closes only on complete workflow evidence.

# Implementation notes

Record audit ownership, defects/fixes, metrics, platform evidence, and blockers.

# Validation

Record the full command, desktop, accessibility, performance, and platform matrix.
