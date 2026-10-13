---
id: 168
title: Say when a version line's remote branch is gone, and confirm before recreating it
status: done
priority: normal
type: improvement
areas:
  - backend
  - frontend
  - sync
created: 2026-10-13
completed: 2026-10-13
parent:
queue:
---

# Goal

Give a line whose upstream branch no longer exists on the remote its own
state, `upstreamGone`, and say it the same way everywhere: the status bar,
Overview, the notification list and Lines. Publishing such a line recreates the
branch on the remote only after an explicit confirmation.

# User outcome

When a pull request is merged and the host deletes its branch, the person
working on that line reads "No longer on the remote" instead of a generic
"Check failed" — or, worse, a cached "Up to date". Overview offers three calm
ways out: switch to the main line, publish again on purpose, or stop tracking
the remote. Publishing never silently resurrects a branch the team closed.

# Context

Reviewed in an artifact that replicated today's behaviour for three cases and
the proposal beside it; the user approved the proposal as drawn.

- **A — never published.** No `branch.<x>.remote`/`merge`: `NoUpstream`. Already
  well explained; unchanged.
- **B1 — deleted on the remote, tracking ref still here.** The common case: the
  host deletes the branch after a merge. GitOdile fetches with `--no-prune`, so
  `refs/remotes/<remote>/<x>` stays. Cached reads compare against it and may say
  "Up to date". A check fails with `RemoteRefMissing`, which the status bar
  reduced to "Check failed"; only an automatic check's notification named the
  reason. Lines showed nothing, because Git reports `[gone]` only when the
  tracking ref is missing. Publish treated the missing ref as "the remote has no
  such branch" and recreated it without a word.
- **B2 — deleted and the tracking ref is gone too** (deleted from this clone, or
  pruned by another tool). Lines said "Remote branch deleted", but the sync
  state was `Unknown` with a `trackingRefUnavailable` warning that read as
  "not recorded yet". Publish recreated the branch and counted the whole
  history (`rev-list --count HEAD`) as versions to publish.

# Scope

- Rust `TeamSyncState::UpstreamGone`, replacing `Unknown` (it was produced only
  by a missing tracking ref, which is exactly Git's `[gone]`). A check whose
  fetch reports `RemoteRefMissing` returns this state instead of an error; a
  cached read with no tracking ref returns it too. The stale tracking ref is
  kept (`--no-prune` policy unchanged) and reported as `remoteCommit`.
- The sync controller keeps a fresh `upstreamGone` across later cached reads of
  the same line and tracking ref, so B1 doesn't fall back to "Up to date" until
  a check says otherwise.
- Status bar: "No longer on the remote", warning tone.
- Overview next step `upstreamGone`: switch to the main line (when one exists
  and is not this line), publish again, stop tracking the remote.
- Notification `upstreamGone` from automatic checks, collapsing like the other
  check notifications, with an action that opens Overview on that project.
- Lines: the active line shows "Remote branch deleted" in B1 as in B2.
- Publish plan `recreatesDeletedBranch`; the dialog warns and the confirm
  button reads "Recreate and publish". When the destination has no remote
  branch, the count and list are the versions not on any branch of that remote
  (excluding the gone one), not the whole history.
- `list_unpublished_versions` no longer fails when the configured upstream ref
  is missing; it uses the same "not on the remote" range.
- New local command `stop_tracking_remote`: `git branch --unset-upstream` for
  the current line, which then reads as case A.

# Out of scope

- Pruning tracking refs. `--no-prune` stays: GitOdile never deletes references
  on its own.
- Detecting B1 without a network check (impossible without asking the remote).
- Changing case A.

# Acceptance criteria

- [x] A check against a deleted upstream returns `upstreamGone` (fresh), keeps
      the stale tracking ref and does not error.
- [x] A cached read with the tracking ref missing returns `upstreamGone`.
- [x] After a fresh `upstreamGone`, a cached read of the same line and tracking
      ref keeps `upstreamGone`.
- [x] Status bar, Overview and Lines name the state; Overview offers its three
      actions, each only when it can work.
- [x] An automatic check that finds the branch gone records one notification;
      repeated checks collapse into it.
- [x] The publish plan flags `recreatesDeletedBranch`, the dialog warns and the
      confirm button says it recreates; the count excludes versions already on
      the remote.
- [x] `list_unpublished_versions` works with a missing upstream ref.
- [x] Stop tracking unsets the upstream and the line reads as "No publish
      destination".
- [x] Rust integration tests over temporary repositories and frontend tests
      cover the above; `pnpm run check` passes.

# Relevant files

- `src-tauri/src/sync/mod.rs`, `src-tauri/src/publish.rs`, `src-tauri/src/status.rs`
- `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/application.rs`
- `src/features/sync/`, `src/features/overview/`, `src/features/publish/`
- `src/features/notifications/`, `src/features/version-lines/`
- `src/app/StatusBar.tsx`, `src/app/App.tsx`

# Dependencies

None.

# Decisions

- `Unknown` is replaced rather than kept beside the new state: its only source
  was a configured upstream with no tracking ref, which Git itself calls gone.
- The "remember gone" rule lives in the frontend sync controller, beside the
  existing rule that keeps fresh evidence across identical cached reads. Rust
  stays stateless and the repository is not written to remember it.
- The "not on the remote" count also applies to a first publish (case A): it is
  the same code path and the whole-history count was wrong there too.

# Implementation notes

- Rust: `TeamSyncState::UpstreamGone` replaces `Unknown`; the
  `trackingRefUnavailable` warning and `MAX_WARNINGS` are gone with it.
  `read_team_sync_status_inner` treats a `RemoteRefMissing` fetch as the answer
  and reports the kept tracking commit as `remoteCommit`.
- `stop_tracking_remote` (sync, `LocalMutation`, repository write) runs
  `git branch --unset-upstream <line>` and returns the cached status. Registered
  in `ipc.rs`, `lib.rs`, the execution inventory and the IPC contract snapshot.
- `status::not_on_remote_revisions` gives `tip --not --exclude=<remote>/<branch>
  --remotes=<remote>`; `git_log_summaries` and `versions_in_range` take revision
  slices. Publish uses it whenever the destination has no remote branch, and
  `list_unpublished_versions` when the upstream's tracking ref is missing.
- Publish plan: `recreatesDeletedBranch` = no remote branch and the line
  already tracks this destination. The dialog shows a warning banner, titles
  itself "Publish “x” again" and confirms with "Recreate and publish"; with no
  new versions the plan line says the versions are already on the remote.
- Sync controller: keeps the evidence of a fresh `upstreamGone` per line
  (tracking ref and kept commit). `applyUpstreamGoneEvidence` turns a later
  local read of that line back into `upstreamGone` while the ref still holds
  that commit, so switching to main and back keeps it. A check of the line,
  a completed Get, or `publishedTo(query, line)` after a successful publish
  replaces the evidence. `stopTracking` commits the new status under a fresh
  generation.
- Overview: next step `upstreamGone` (warning tone) with `switchToDefault`
  (primary, only when the remote's default line exists and is another line),
  `publish` labelled "Publish again…" (when `canPublish`, which now also holds
  for a gone line), and `stopTracking`.
- Notifications: kind `upstreamGone` (warning, collapses, unread on arrival)
  with an "See options" action that opens Overview on that project; listed in
  Settings' notification events.
- Lines: `withActiveLineGone` marks the active line from the sync status.
- An automatic check notifies only when it first finds the line gone (the
  previous status was not gone for that line), so a dismissed entry stays
  dismissed.
- A destination with no remote branch and nothing new (a new line straight
  off main, or a recreated one) says the branch will be created with versions
  the remote already has; the toast and the receipt say the line was
  published instead of "0 versions".
- `list_unpublished_versions` keeps any resolvable upstream (a line tracking a
  local branch included) and only falls back to "not on the remote" when it no
  longer resolves.
- Release: 0.3.1 highlight `lineLeftTheRemote`, notes rendered with
  `pnpm run release:notes 0.3.1`.
- Not changed: case A's next-step card, `--no-prune`.

# Validation

- `pnpm run check` (2026-10-13): docs, architecture, typecheck, frontend tests
  (140 files, 1455 tests) and build passed; the Rust step then stopped because
  a running dev build locked `target/debug/gitodile.exe` (os error 5).
- `pnpm run check:rust` with `CARGO_TARGET_DIR` set to a separate folder, after
  the last Rust edit: `cargo fmt --check` clean, `cargo clippy --all-targets
  --all-features -D warnings` clean, `cargo test`: 597 passed, 1 ignored, plus
  the integration targets.
- New Rust tests in `src-tauri/src/tests/sync_tests.rs`: gone after a check
  (no prune, fresh, kept commit), gone from a missing tracking ref, publish
  recreate flag and count, first-publish count, unpublished list past a pruned
  upstream, stop tracking.
- `pnpm run check` after the review fixes (2026-10-13, app closed): passed —
  docs, architecture, typecheck, frontend tests (140 files, 1456 tests),
  build, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`
  (599 passed, 1 ignored, plus the integration targets).
- Review pass before committing found and fixed: gone memory lost when
  switching lines, the notification repeating after a dismissal, "0 versions"
  wording for a branch-only publish, a regression for lines tracking a local
  branch, a status still about the previous line marking the new one in
  Lines, and a duplicated doc comment. New tests cover each.
- Not validated in the running Tauri app: the flows were exercised in the
  review artifact's simulator, which mirrors this logic, not in GitOdile itself.
