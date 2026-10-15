---
id: 173
title: Clean up several version lines at once from Lines
status: active
priority: normal
type: feature
areas:
  - frontend
  - rust
  - recovery
  - ux
created: 2026-10-15
completed:
parent:
queue: "24"
---

# Goal

"Review" on the Lines list's "Ready to clean up" block opens a preview that
deletes the chosen lines in one confirmed step, rechecking each one first and
reporting the result line by line.

# User outcome

A project with a dozen merged `fix/…` and `feature/…` lines is cleared in one
step instead of a dozen dialogs. The reader sees what will go, why each line
is safe to delete, and whether the published copies go too, and can bring a
deleted line back afterwards.

# Context

Task [171](../done/171-group-the-lines-list.md) cut the Lines list into "In
progress" and a folded "Ready to clean up", whose "Review" only opens the
block. The bucket uses the same proof as the single delete plan
(`isRetainedElsewhere`: another local or remote-tracking ref holds the tip),
so every line in it can already be deleted one at a time through
`plan_delete_version_line` / `delete_version_line`. That flow plans with a
`stateToken`, refuses the active line, a line open in another worktree and a
Git operation in progress, can clear the published copy (`deleteRemote`), and
keeps a verified recovery point only when the work survives as copies
(ADR 0016). A batch must not weaken any of those checks.

# Scope

- Rust: a batch plan and execute for deleting lines that are kept
  elsewhere, in `version_lines.rs` behind narrow commands in `ipc.rs`.
  - The plan takes the chosen names, validates each one as the single plan
    does, and returns per line: tip, the refs that keep it, published copy
    (if any), and a reason when the line is excluded.
  - Execute revalidates every line against the plan's state token before
    removing anything; a line that no longer qualifies is skipped with its
    reason, and the rest continue.
  - The published copy is removed only when asked, per line that has one.
    Remote failures are reported per line and never undo the local half.
  - The result lists each line as deleted, skipped (reason), or deleted
    locally with a remote error, plus a fresh snapshot.
- Recovery: each deleted line's name and tip is recorded so it can be
  recreated from Recovery, reusing the existing recovery reference mechanism.
  Confirm during implementation whether that needs an ADR.
- Frontend: "Review" opens a dialog listing the block's lines with
  checkboxes (all on), each with where its work is kept and its sync glyphs;
  a "Delete on the remote too" switch, off by default and only offered when
  at least one chosen line has a published copy; the plan's summary and
  consequences before the confirmation; a result toast or summary that says
  how many were deleted, skipped and remote failures.
- The dialog goes through the feature's port and `tauriAdapter.ts`, takes the
  mutation slot like the other Lines dialogs, and works by keyboard.
- English and Spanish copy; DESIGN.md (Lines) and README updated.

# Out of scope

- Deleting lines that are not safe to delete (unique work, other worktree,
  the active or main line).
- Deleting remote-only branches that have no local line.
- Scheduling or automatic clean-up.
- Changing the single-line delete dialog beyond sharing code with the batch.

# Acceptance criteria

- [ ] "Review" opens the batch dialog; the block heading still folds.
- [ ] The plan excludes any line that fails the single-delete checks, with a
      reason, and offers only lines kept elsewhere.
- [ ] Execute refuses a stale plan and revalidates each line; a line that no
      longer qualifies is skipped and reported, the rest are deleted.
- [ ] Remote copies are removed only when asked; a remote failure is reported
      for that line and the local deletion stands.
- [ ] Every deleted line can be recreated from Recovery.
- [ ] The result names what was deleted, skipped and failed, in both
      languages, and Lines refreshes from the returned snapshot.
- [ ] Rust unit tests for the planner; integration tests on temporary
      repositories (all deletable, one became active between plan and
      execute, one open in a worktree, remote delete refused).
- [ ] Frontend tests for the dialog: selection, remote switch, plan errors,
      partial results, keyboard and empty states.
- [ ] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/version_lines.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/recovery/`
- `src/features/version-lines/VersionLinesDialog.tsx`
- `src/features/version-lines/VersionLinesPanel.tsx`
- `src/features/version-lines/domain.ts`
- `src/features/version-lines/port.ts`
- `src/features/version-lines/tauriAdapter.ts`
- `src/features/version-lines/lineGroups.ts`
- `docs/adr/` (ADR 0016)
- `DESIGN.md`

# Dependencies

- [171](../done/171-group-the-lines-list.md) (done).

# Decisions

- Batch delete is classified as destructive and keeps the preview and
  confirmation the single delete has.
- Lines that stop qualifying between plan and execute are skipped, not a
  reason to abort the whole batch; the result says which and why.
- "Delete on the remote too" is off by default.

# Implementation notes

Complete this section during implementation.

# Validation

Record the exact commands run and their results.
