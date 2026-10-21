---
id: 173
title: Clean up several version lines at once from Lines
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - recovery
  - ux
created: 2026-10-15
completed: 2026-10-21
parent:
queue:
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

- [x] "Review" opens the batch dialog; the block heading still folds.
- [x] The plan excludes any line that fails the single-delete checks, with a
      reason, and offers only lines kept elsewhere.
- [x] Execute refuses a stale plan and revalidates each line; a line that no
      longer qualifies is skipped and reported, the rest are deleted.
- [x] Remote copies are removed only when asked; a remote failure is reported
      for that line and the local deletion stands.
- [x] Every deleted line can be recreated from Recovery: a verified record
      with its name and tip is kept per line (ADR 0034). Listing and
      recreating them on screen is the Recovery center's, task 065-5.
- [x] The result names what was deleted, skipped and failed, in both
      languages, and Lines refreshes from the returned snapshot.
- [x] Rust unit tests for the planner; integration tests on temporary
      repositories (all deletable, one became active between plan and
      execute, one open in a worktree, remote delete refused).
- [x] Frontend tests for the dialog: selection, remote switch, plan errors,
      partial results, keyboard and empty states.
- [x] `pnpm run check` passes.

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

- Rust: `plan_clean_up_version_lines` / `clean_up_version_lines` in
  `version_lines.rs`, behind narrow commands in `ipc.rs` (read / destructive
  repository write in `application.rs`). The single delete's checks were split
  into `read_delete_context` (once per call: Git version, operation in
  progress, active line, main lines, worktrees) and `check_line_can_go` (per
  line), which both flows now share, as is `remove_local_line`.
- Each planned line carries its own state token (name, tip, published copy).
  The refs that keep it are deliberately not in the token: the other lines in
  the same clean-up change them as they go, so retention is rechecked live
  right before each deletion instead. A line held by nothing any more is
  skipped as unique work.
- Review found the block's criterion wrong: "another ref holds the tip" is
  true of a published line in progress (its own `origin/x`), a line just
  created on main, and a line another one grew from. "Ready to clean up" now
  means finished (`isFinished`, Rust's `finished_lines`): merged into the
  main line (local or the remote's copy, from the inventory's `ahead-behind`
  atoms) and with its own work — remote branch deleted, a reflog entry for a
  version saved on it, or a tip off the main line's first-parent history.
  Age is not a criterion. The batch rechecks it (`version_line_not_finished`).
  Squash/rebase-merged lines are not detected in the list (patch-id per line
  on every refresh is too dear); they stay in progress and the single delete
  still handles them (ADR 0016). `keptOnlyByCleanUp` went with the old
  criterion: a finished line is always held by the main line.
- Discovery cost, measured on a synthetic 30,600-version repository with
  400 refs: replacing the whole-history reachability walk (0.3 s) with
  `merge-base --independent` took 0.2 s with a commit-graph but 1.5 s without
  one, so the walk stays. It now runs beside the inventory instead of after
  it; the HEAD reads run beside the main-line lookup; and the inventory's
  second `ahead-behind` (against the remote's main line, +0.2 s on 300 lines)
  is asked only when that copy is ahead of the local main line. The finished
  check adds one reflog read for the merged lines and one first-parent walk
  (0.17 s on 30,000 versions) only when some merged line still needs it.
- Remote copies go after every local deletion, one `git push --porcelain
  --delete` per remote, read per ref; failures are reported per line and never
  undo the local half.
- Recovery needed an ADR: [0034](../../docs/adr/0034-one-recovery-point-per-line-in-a-clean-up.md).
  A clean-up is its own history-recovery operation
  (`clean-up-version-lines`, newest 50 kept), one verified record per deleted
  line with its name and tip; a clean-up asks for at most 50 lines, so it never
  evicts its own records or ADR 0016's.
- Frontend: `CleanUpVersionLinesDialog.tsx`, through the feature port and
  `tauriAdapter.ts`, taking the mutation slot like the other Lines dialogs.
  "Review" became its own button laid over the clean-up heading's hint line
  (the heading still folds), and Delete on that heading opens it too. The row
  glyph helpers moved to `lineGlyphs.tsx` so the dialog can draw them.
- Recreating a line from Recovery: the records are written and verified, and
  the clean-up result reports each reference, but no screen lists them yet;
  that is the Recovery center (065-5).
- Final review fixes:
  - A line tracking a remote's default branch (created from `origin/main`)
    offered that branch as its "published copy", so "Delete on the remote
    too" could have deleted the project's main line on the remote. The
    single delete had the same gap. `live_published_line` now never offers a
    remote default branch (`DeleteContext::default_remote_refs`).
  - `finished_among` ran about six Git processes per line; it is now one
    `for-each-ref` over the chosen lines with `ahead-behind` against both
    homes of the main line (line-by-line `merge-base --is-ancestor` only on
    Git before 2.41), plus the shared reflog and first-parent reads.
  - A failure reading the list back after lines were deleted turned the
    whole clean-up into an error. The result's `snapshot` is now optional;
    the screen refreshes itself when it is missing.
  - Known and accepted: when removing a line fails after its recovery point
    was written, the point stays (it protects a line that still exists).

# Validation

- `cargo test --lib clean_up` — 9 passed (planner, token, porcelain parser;
  temporary repositories: all deletable, one became active, one in a
  worktree, one moved since the preview, remote copy kept/deleted, remote
  delete refused). After the criterion change: lines on a real main line,
  plus finished vs. fresh / published-in-progress / stacked lines, and a
  merged line whose remote branch was deleted.
- `npx vitest run src/features/version-lines` — 160 passed, including the
  dialog's selection, remote switch, plan error, partial result, keyboard,
  empty and capped states, and the panel's Review button and Delete key.
- Browser harness (Vite, mocked IPC): the Review button, the dialog, and a
  partial result checked visually; harness removed afterwards.
- `pnpm run check` (2026-10-21, after the final review) — exit 0: docs and
  architecture checks, typecheck, 1572 frontend tests, production build,
  `cargo fmt`, `cargo clippy -D warnings` and 620 Rust tests. Run with a
  separate `CARGO_TARGET_DIR`, since a running `tauri dev` locks
  `target/debug/gitodile.exe`.
- Not run: the real Tauri app against a repository.
