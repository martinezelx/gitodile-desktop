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
queue: "02"
---

# Goal

Make every active merge conflict discoverable and inspectable in a dedicated,
read-only project workspace before resolution actions are enabled.

# User outcome

The user can see why work stopped, which files overlap, and the base/current/
incoming evidence without opening or changing anything accidentally.

# Context

This slice proves navigation, lifecycle, roles, bounded data, and accessibility
before mutations increase risk.

Since 2026-10-27 the `1.0.0` resolver has no three-pane editor (epic 037,
"Scope change"). Each side's change is shown against the common base with the
existing typed diff renderer of the Changes tab; no editor dependency is added.
Overview already has a `conflicts` state and a conflicted-file list to build on.

# Scope

- Add contextual entry from Overview's `conflicts` state, the Changes tab of the
  Workbench, the search palette, and app-started merge results; no
  navigation-rail entry.
- Build the lazy screen, virtualized file list, progress/filtering, session
  summary, a read-only "what each side changed" view per file using the
  existing diff renderer, and technical details.
- Preserve per-project selection/scroll and suspend hidden effects/subscriptions.
- Show a paused rebase, cherry-pick, revert or marker-less unmerged state
  through the same entries and screen, read-only (epic 037 §1b): what is
  paused, its overlapping files, that GitOdile cannot finish it yet, and how to
  continue or abort it with the tool that started it, with exact commands in
  technical details. No action runs those commands.
- Cover every conflict class with accurate read-only evidence or a safe explicit
  limitation; add external-editor/open-file affordance only where already safe.

# Out of scope

- Editing, accepting sides, writing, staging, reset, completion, or abort.

# Acceptance criteria

- [ ] Opening/leaving/refreshing never changes worktree, index, refs, or config.
- [ ] Roles and operation state remain correct for external merges and restart.
- [ ] Paused non-merge operations are explained read-only with their files and
      offer no action GitOdile cannot complete.
- [ ] Large file lists and content remain bounded, virtualized and
      cancellable, and normal startup and screen switching do not regress.
- [ ] Loading/stale/unsupported/missing/error states plus English/Spanish,
      keyboard/focus/screen reader, both themes, narrow layout, and zoom pass.
- [ ] Screen registration, lifecycle, IPC, tests, and docs pass focused checks.

# Relevant files

- `src/app/screens.tsx`
- `src/features/overview/`
- `src/features/changes/`
- `src/features/workbench/`
- [037-1](037-1-conflict-domain-and-recovery.md)

# Dependencies

Task 037-1.

# Decisions

Ship no editing affordance in this slice; read-only truth is independently
valuable and provides the integration surface for later slices.

# Implementation notes

Record screen footprint, selection/cache lifecycle, accessibility semantics,
and unsupported conflict presentation.

# Validation

Record frontend/Rust checks, desktop read-only verification, and measurements.
