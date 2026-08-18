---
id: 064-1
title: Discover and inspect changes saved for later
status: active
priority: high
type: feature
areas:
  - changes
  - rust
  - frontend
  - performance
created: 2026-08-18
completed:
parent: "064"
queue: "15"
---

# Goal

Add bounded, read-only discovery and inspection of the standard Git stash stack
inside Changes before any stash mutation is enabled.

# User outcome

The user can see every set of changes saved for later by GitOdrile, Git, or
another compatible client and inspect its files and diffs.

# Context

This is slice 1 of epic 064. Interoperability with `refs/stash` and bounded
evidence must be proved before create, restore, or removal actions exist.

# Scope

- Implement snapshot-bound, paginated stash summaries and lazy file/diff details.
- Add the **Current changes / Saved for later** switch with independent project
  selection and scroll state.
- Reuse the established diff renderer and exceptional states.
- Handle external changes, missing/corrupt objects, duplicate OIDs, linked
  worktrees, stale pages, cancellation, and shared-ref invalidation.

# Out of scope

- Creating, restoring, removing, or modifying any stash entry.

# Acceptance criteria

- [ ] Standard external and GitOdrile stashes parse safely with stable entry
      identity, names, dates, origin confidence, counts, and technical evidence.
- [ ] Pagination/details are bounded, stale-safe, lazy, and virtualized at the
      epic's 1,000-entry/file cases.
- [ ] Opening, refreshing, switching, or leaving the view never mutates refs,
      index, worktree, config, or remote state.
- [ ] Read-only states, localization, keyboard/focus/screen reader, both themes,
      narrow layouts, and 200% zoom pass focused tests.

# Relevant files

- `work/active/064-set-changes-aside-safely.md`
- `src/features/changes/`
- `src-tauri/src/changes.rs`
- `src-tauri/src/watch.rs`

# Dependencies

Task 065-6 in execution order; technically unblocked by existing architecture.

# Decisions

Discovery lands before mutation and uses the standard stash stack as truth.

# Implementation notes

Record reflog format, cursor identity, caps, cache ownership, and diff reuse.

# Validation

Record parsing/integration/frontend/performance checks and exact outcomes.
