---
id: 037-4
title: Resolve text conflicts with safe writes and reset
status: active
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - recovery
created: 2026-08-18
completed:
parent: "037"
queue: "08"
---

# Goal

Add editable text results, per-region choices, explicit save/mark-resolved, and
per-file reset backed by the conflict snapshot.

# User outcome

For ordinary text overlaps, the user can combine both sides, edit the result,
mark a file resolved, and safely reconsider that resolution.

# Context

This is the first mutating conflict slice. Every write must consume task 037-1's
snapshot and stale-state contract.

# Scope

- Implement aligned regions, current/incoming/both choices, manual result
  editing, search, conflict navigation, undo/redo, and linear accessible mode.
- Keep edit-buffer, save-to-working-file, and mark-resolved/stage as distinct
  explicit states and mutations.
- Revalidate object IDs, file state, mode, worktree hash, session epoch, and
  snapshot before atomic/bounded writes or index changes.
- Implement per-file reset to the original conflicted stages/content using the
  verified snapshot; confirm bulk side/reset actions.
- Reconcile external edits explicitly and preserve newer content on ambiguity.

# Out of scope

- Merge completion/abort and non-text/structural conflict resolution.

# Acceptance criteria

- [ ] Region choices and manual edits produce exact expected bytes across line
      endings, long lines, missing base, Unicode, IME, and marker-like content.
- [ ] Save and mark-resolved are separate, stale-safe, verified local mutations.
- [ ] Per-file reset restores exact original stages/content/mode and refuses if
      newer work cannot be preserved.
- [ ] Restart, external edit, watcher burst, project switch, linked worktree,
      lock, permission, interruption, and uncertain outcomes retain evidence.
- [ ] Keyboard, focus, screen reader, zoom, both themes/locales, responsiveness,
      and reduced motion meet the parent acceptance criteria.
- [ ] Rust/frontend integration tests and focused checks pass.

# Relevant files

- `work/active/037-guided-conflict-resolution.md`
- `work/active/conflicts/037-1-conflict-domain-and-recovery.md`
- `work/active/conflicts/037-3-read-only-conflict-workspace.md`

# Dependencies

Tasks 037-1, 037-2, and 037-3.

# Decisions

No implicit staging or completion follows saving a result.

# Implementation notes

Record alignment/result model, atomic-write path, index operations, external
edit reconciliation, and reset verification.

# Validation

Record content corpus, failure injection, interaction measurements, desktop
accessibility checks, and focused command output.
