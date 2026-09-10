---
id: 037-3
title: Add the read-only conflict workspace
status: active
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - accessibility
created: 2026-08-18
completed:
parent: "037"
queue: "07"
---

# Goal

Make every active merge conflict discoverable and inspectable in a dedicated,
read-only project workspace before resolution actions are enabled.

# User outcome

The user can see why work stopped, which files overlap, and the base/current/
incoming evidence without opening or changing anything accidentally.

# Context

This slice proves navigation, lifecycle, roles, bounded data, and accessibility
before editable mutations increase risk.

# Scope

- Add contextual entry from Overview, Changes, command palette, and app-started
  merge results; no permanent sidebar item.
- Build lazy workspace shell, virtualized file queue, progress/filtering, session
  summary, read-only three-way/linear evidence, and technical details.
- Preserve per-project selection/scroll and suspend hidden effects/subscriptions.
- Cover every conflict class with accurate read-only evidence or a safe explicit
  limitation; add external-editor/open-file affordance only where already safe.

# Out of scope

- Editing, accepting sides, writing, staging, reset, completion, or abort.

# Acceptance criteria

- [ ] Opening/leaving/refreshing never changes worktree, index, refs, or config.
- [ ] Roles and operation state remain correct for external merges and restart.
- [ ] Large file queues/content remain bounded, virtualized, cancellable, and
      within the selected editor architecture budgets.
- [ ] Loading/stale/unsupported/missing/error states plus English/Spanish,
      keyboard/focus/screen reader, both themes, narrow layout, and zoom pass.
- [ ] Screen registration, lifecycle, IPC, tests, and docs pass focused checks.

# Relevant files

- `src/screens.tsx`
- `src/features/changes/`
- `work/active/conflicts/037-1-conflict-domain-and-recovery.md`
- `work/active/conflicts/037-2-editor-foundation-spike.md`

# Dependencies

Tasks 037-1 and 037-2.

# Decisions

Ship no editing affordance in this slice; read-only truth is independently
valuable and provides the integration surface for later slices.

# Implementation notes

Record screen footprint, selection/cache lifecycle, accessibility semantics,
and unsupported conflict presentation.

# Validation

Record frontend/Rust checks, desktop read-only verification, and measurements.
