---
id: 065-4
title: Integrate version lines and diverged team changes safely
status: active
priority: high
type: feature
areas:
  - sync
  - version-lines
  - conflicts
  - recovery
  - frontend
  - rust
created: 2026-08-18
completed:
parent: "065"
queue: "10"
---

# Goal

Add one previewed merge-based integration workflow for a local version line or
a diverged upstream, completing both clean results and overlaps in-app.

# User outcome

The user can bring another line of work into the current line and can get team
changes even when both sides have new saved versions, without choosing between
technical Git strategies or falling back to a terminal.

# Context

Task 014 intentionally supports only strict fast-forward team updates. Task 037
owns conflict truth, editing, completion, and abort. This task initiates the
merge and connects clean/conflicting outcomes to those established contracts.

# Scope

- Offer **Bring in changes from...** for another local/remote version line and
  extend **Get team changes** when the configured upstream has diverged.
- Fetch only on explicit remote planning/execution; local merge planning never
  contacts the network.
- Preview source/destination commits, relation, changed-file evidence, local and
  remote consequences, expected fast-forward/merge result, and recovery.
- Block unresolved operations and unsafe dirty states; offer task 064 as an
  explicit next step when available, never auto-stash.
- Revalidate under the common-repository mutation lock and create a verified
  durable recovery point before changing history/index/worktree.
- Use a normal merge strategy that preserves existing history. Never rebase,
  squash, force push, silently resolve, or automatically publish.
- Verify clean/empty/already-integrated outcomes. Route overlaps into task 037
  with correct roles, origin, recovery evidence, and resume/complete/abort
  behavior.
- Report interrupted or partially observed mutation as uncertain and preserve
  all recovery/conflict evidence.

# Out of scope

- Rebase, squash merge, octopus merge, cherry-pick, force push, pull requests,
  or automatic publish.
- Choosing arbitrary merge strategies or editing Git configuration.
- Duplicating any conflict editor or completion/abort implementation.

# Acceptance criteria

- [ ] Local branch and configured-upstream integration handle already-contained,
      fast-forward, clean merge, empty merge, and conflict outcomes accurately.
- [ ] Planning and execution bind exact refs/commits/status/fetch evidence;
      moved refs or changed work produce a stale result, never a retargeted merge.
- [ ] Dirty, unborn, detached, shallow, locked, in-progress, missing-upstream,
      and unsupported states block with actionable guidance.
- [ ] Recovery is verified before mutation and remains discoverable after
      success, conflict, failure, interruption, or restart.
- [ ] Conflicts enter task 037 without losing source roles or performing an
      automatic stage, resolution, abort, commit, or publish.
- [ ] Hooks, signing, identity, credential, remote rejection, and uncertain
      outcomes remain truthful and bounded.
- [ ] Linked worktrees serialize common-ref mutations while refreshing only the
      correct worktree content plus shared refs.
- [ ] Full temporary-repository, frontend, accessibility, and cross-platform
      tests pass, IPC/docs are current, and `pnpm run check` passes.

# Relevant files

- `src-tauri/src/sync.rs`
- `src-tauri/src/version_lines.rs`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/repository_access.rs`
- `work/active/037-guided-conflict-resolution.md`
- `work/active/064-set-changes-aside-safely.md`

# Dependencies

- Task 065-1 baseline audit.
- Task 037 conflict session, recovery, completion, and abort contracts.
- Existing task-014 fast-forward integration remains the narrow fast path.

# Decisions

- `1.0.0` provides one safe merge-based model; rebase and force push are
  progressive-power features.
- Integration never auto-stashes or auto-publishes.
- This task owns initiation; task 037 owns a conflict once one exists.

# Implementation notes

Record ancestry/path algorithms, merge arguments, recovery ownership,
conflict handoff, invalidation, and platform findings.

# Validation

Record clean/diverged/conflicting remote fixtures, injected failures, desktop
journeys, platform coverage, and final check output.
