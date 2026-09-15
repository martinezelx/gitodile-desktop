---
id: 064-4
title: Remove one saved set with durable recovery
status: active
priority: high
type: feature
areas:
  - changes
  - rust
  - recovery
  - frontend
created: 2026-08-18
completed:
parent: "064"
queue: "20"
---

# Goal

Implement exact single-entry removal only after protecting its commit with a
durable recovery record that can safely reinsert it at the stash tip.

# User outcome

The user can remove an obsolete saved copy without changing project files and
can undo an accidental removal.

# Context

This is the destructive slice of epic 064. Its recovery format requires an ADR
or explicit extension to existing recovery ADRs before implementation.

# Scope

- Define linked-worktree ownership, retention, atomicity, privacy, duplicate
  OIDs, garbage collection, and failure behavior for stash-removal recovery.
- Plan and confirm one exact reflog entry; re-resolve it under the mutation lock.
- Create/verify a hidden recovery ref and metadata before dropping the entry.
- Verify removal and implement safe Undo as reinsertion at the newest position.

# Out of scope

- Clear all, bulk removal, restoring original reflog position, or file changes.

# Acceptance criteria

- [ ] Selector drift, duplicate OIDs, external stack changes, or stale plans can
      never retarget removal.
- [ ] Recovery is durable and verified before the standard entry is removed.
- [ ] Remove changes no worktree/index/config/branch/remote state.
- [ ] Undo safely restores content as the newest entry and explains that the
      original reflog position is not recreated.
- [ ] Failure/uncertain/restart/linked-worktree/retention/GC tests pass.

# Relevant files

- `work/active/064-set-changes-aside-safely.md`
- `work/active/release-1.0/065-5-recovery-center.md`
- `src-tauri/src/recovery.rs`

# Dependencies

Tasks 064-1 through 064-3 and the Recovery inventory contract from task 065-5.

# Decisions

Never expose or implement `git stash clear`.

# Implementation notes

Record ADR, stable entry identity, ref/metadata transaction, retention, and Undo.

# Validation

Record drift/duplicate/failure/GC/restart fixtures, desktop audit, and checks.
