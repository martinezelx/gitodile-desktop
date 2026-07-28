---
id: 014
title: Get team changes through a safe fast-forward
status: active
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
  - recovery
created: 2026-07-27
completed:
---

# Goal

Let the user bring newer upstream versions into the current project when Git
can advance the current branch with a clean, reversible fast-forward.

# User outcome

When team changes are available, the user can preview what will happen, save
their own work first when necessary, and update safely. Cases where both sides
changed are stopped and explained rather than merged or rebased automatically.

# Context

Task 013 discovers and explains remote state but intentionally does not update
the current branch or files. This task implements the first safe inbound sync
path.

For the MVP, **Get team changes** means a fresh fetch followed by an explicit
fast-forward-only update. It is not a generic `git pull`, and it never creates a
merge commit, rebases local work, or resolves conflicts.

# Scope

## Eligibility

Plan the operation only when:

- the project is on a named branch with a configured, resolvable upstream;
- a fresh task-013 check proves the local branch is strictly behind and not
  ahead/diverged;
- no merge, rebase, cherry-pick, revert, or bisect is in progress;
- the working tree and index are completely clean, including no untracked files
  that could be overwritten;
- no conflicting mutation is running in the same project or shared
  `commonGitDir`.

If local changes exist, direct the user to review and save them through task
010. Do not stash, discard, or silently include them.

## Planning contract

Return a typed `GetTeamChangesPlan` with at least:

- operation kind: `history-mutation`;
- `requiresConfirmation: true`;
- repository/session identity and state token;
- current branch, upstream remote, and destination branch;
- current local commit and freshly fetched upstream commit;
- number of incoming saved versions;
- bounded changed-file summary and truncation metadata;
- ordered steps, risks, and recovery information;
- recovery-reference name that will be created;
- explicit statement that no merge commit or rebase will occur.

Preview commit/file information using machine-readable Git output. Repository
content and commit messages are untrusted display data and must never become
HTML or command arguments without appropriate handling.

## Execution contract

Return a typed `GetTeamChangesResult` with at least:

- previous and resulting commit IDs;
- branch, remote, and destination;
- received version count;
- recovery reference;
- refreshed working-tree and remote relation.

Execution must:

1. revalidate repository identity, clean status, operation state, local `HEAD`,
   upstream configuration, and state token;
2. perform a fresh fetch of the selected remote;
3. recompute ancestry and reject any stale, up-to-date, ahead, or diverged plan;
4. create a durable recovery reference pointing to the previous local `HEAD`;
5. update with an explicit fast-forward-only operation;
6. verify the resulting `HEAD`, worktree status, and upstream relation;
7. refresh the active project session.

Use system Git with separate arguments. Never use `pull`, force, reset, checkout
of another branch, rebase, automatic stash, or conflict auto-resolution.

Define the minimal recovery-reference namespace, collision behavior, metadata,
and retention consequence in an ADR before implementation. Do not delete the
reference automatically in this task; broader lifecycle/cleanup remains future
work.

## Failure and uncertain outcomes

Provide structured outcomes for:

- clean-state changed since preview;
- upstream changed, disappeared, or was rewritten;
- local branch changed or became detached;
- no longer behind, or now diverged;
- recovery-reference creation failure;
- files locked or checkout/update failure;
- authentication, network, timeout, cancellation, or remote rejection;
- post-operation verification failure.

If failure occurs after the recovery reference is created, retain it and report
both the observed `HEAD` and recovery reference. Never automatically rewrite
files to “repair” an uncertain result.

## UI

- Enable **Get team changes** from task 013's behind state.
- Use the shared safe-operation preview/confirmation pattern from tasks 010 and
  011.
- Show incoming version count, a concise file summary, destination, local
  consequences, and recovery path.
- While running, show fetch, safety check, recovery point, update, and verify as
  honest phases without artificial delays.
- On success, explain that the project now includes the newer team versions.
- On divergence, explain that both sides contain different saved versions and
  that guided integration is not available yet.
- Keep progress/result attached to the originating project when switching
  sessions.

# Out of scope

- Merge commits, rebasing, squash, or choosing an integration strategy.
- Automatic stashing or integration with dirty/untracked files.
- Conflict resolution.
- Detached-HEAD or unborn-branch integration.
- Selecting arbitrary commits, branches, tags, or remotes to integrate.
- Submodule updating.
- Force/reset recovery, automatic rollback, or recovery-reference cleanup.
- Background pull, periodic sync, or batch updates across projects.

# Acceptance criteria

- [ ] Only a freshly verified behind-only branch with a completely clean
      worktree/index can produce an executable plan.
- [ ] The plan identifies incoming versions, bounded file impact, destination,
      exact fast-forward behavior, and recovery reference.
- [ ] Execution repeats fetch and all safety checks immediately before mutation.
- [ ] A recovery reference exists before local `HEAD` or working files change.
- [ ] The update is fast-forward-only and cannot create a merge commit or
      rebase.
- [ ] Clean, up-to-date, ahead, diverged, detached, unborn, no-upstream,
      operation-in-progress, and stale states are blocked explicitly.
- [ ] Local uncommitted and untracked files are never stashed, overwritten, or
      discarded.
- [ ] Failure/uncertainty retains the recovery reference and reports observed
      state honestly.
- [ ] Success refreshes working-tree and remote status in the correct project
      session.
- [ ] Spanish/English, keyboard, focus, loading, cancellation, error, success,
      and reduced-motion states are complete.
- [ ] An ADR records the recovery-reference contract introduced here.

# Required tests and audit

## Rust unit tests

- Eligibility and blocker mapping.
- Plan/state-token generation and invalidation.
- Incoming commit/file summary parsing and truncation.
- Recovery-reference naming and collision handling.
- Fast-forward result and uncertain-outcome classification.

## Rust integration tests

Use local bare remotes and multiple clones for:

- one and many incoming commits;
- up-to-date, ahead, and diverged histories;
- upstream rewritten/disappeared between preview and execution;
- dirty staged, unstaged, untracked, ignored-only, and conflicted states;
- branch/HEAD changed between preview and execution;
- recovery reference created before success and retained after injected failure;
- worktree/index unchanged for every blocked precondition;
- successful result exactly matches upstream without a merge commit;
- linked-worktree/shared-`commonGitDir` mutation coordination.

## Frontend and desktop audit

- Preview with small, large, truncated, renamed, binary, and non-ASCII change
  summaries.
- Switch projects during every operation phase.
- File-lock, offline, credentials, cancellation, stale-plan, divergence, and
  verification failure states.
- Light/dark, narrow/large window, keyboard, screen reader, and reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/adr/`
- `work/active/010-save-version.md`
- `work/active/013-check-team-changes.md`
- `src/main.tsx`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- Task 010 for saving local changes before integration.
- Task 012 for session-bound operations and shared-worktree coordination.
- Task 013 for fresh remote state and shared sync contracts.

# Decisions

- The first inbound integration supports fast-forward only.
- A completely clean worktree/index is required even where Git might permit a
  non-overlapping dirty update.
- Fetch and integrate are separate phases with repeated validation.
- A recovery reference precedes mutation and is retained until a future
  lifecycle policy safely handles cleanup.

# Implementation notes

Complete during implementation. Record the ADR, exact Git arguments, recovery
namespace, verification strategy, and injected-failure fixtures.

# Validation

Record exact frontend, Rust, temporary-remote, desktop, accessibility, and
cross-platform checks.

