---
id: 013
title: Check for team changes and explain remote status
status: active
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
created: 2026-07-27
completed:
---

# Goal

Provide a safe, explicit **Check for team changes** action that refreshes remote
knowledge and explains whether the current version line is up to date, ahead,
behind, or divergent without modifying working files or local branch history.

# User outcome

The user can find out whether teammates published newer versions, understand
what the result means, and choose the correct next action without needing to
interpret `fetch`, upstreams, or ahead/behind notation.

# Context

Task 011 needs remote discovery and a fresh preflight before publishing. This
task must extract and reuse that sync-domain code rather than implementing a
second remote parser. Task 011 remains responsible for publish planning; task
013 turns the shared discovery/fetch result into a durable, visible project
state.

A Git fetch contacts a remote and updates local remote-tracking metadata, but it
does not update the current branch, index, or working files. The UI must say
both facts clearly.

# Scope

## Shared sync contract

- Introduce a typed sync service reused by publish planning and this screen.
- Discover configured remotes, fetch refspecs, current branch, upstream,
  upstream remote/destination, and local/remote commit identifiers.
- Redact credentials and sensitive URL components before values cross the Tauri
  boundary, enter logs, or appear in errors.
- Never assume `origin`, GitHub, a default branch name, or one remote.
- Return a structured `RemoteSyncStatus` with at least:
  - state: `noRemote`, `noUpstream`, `unborn`, `detached`, `upToDate`, `ahead`,
    `behind`, `diverged`, or `unknown`;
  - local branch and commit;
  - selected remote and destination branch;
  - ahead and behind counts;
  - last successful check time;
  - whether the data is cached or freshly fetched;
  - structured warnings and available next actions.

## Check operation

- Add a narrow `check_team_changes` command that:
  - revalidates repository identity;
  - resolves the configured upstream or requires remote/destination selection
    using task 011's rules;
  - invokes system Git with separate arguments;
  - fetches only the selected remote using its configured mapping;
  - does not prune, fetch tags implicitly beyond configured behavior, update
    `HEAD`, merge, rebase, checkout, reset, or touch the index/worktree;
  - computes relation/counts from commit ancestry after fetch.
- Classify this as a network read with local remote-tracking metadata mutation.
  The explicit button press authorizes it; a confirmation dialog is not
  required because it cannot change the user's branch or files.
- Use configured credential helpers. Surface authentication, authorization,
  host-key, proxy, offline, timeout, cancellation, malformed configuration, and
  remote rejection separately where Git makes that distinction reliable.
- After cancellation or timeout, do not claim the remote state is current.

## UI

- Add a remote-status area to the active project overview.
- Keep the last truthful result visible while refreshing and label its age.
- Show one plain-language primary result and optional technical details:
  - up to date;
  - local saved versions waiting to publish;
  - newer team versions available;
  - both sides changed separately;
  - remote/upstream setup required;
  - result unavailable or stale.
- Offer contextual actions only when implemented:
  - **Publish changes** through task 011 when ahead;
  - **Get team changes** as disabled/coming soon until task 014 when behind;
  - no unsafe one-click action when diverged.
- Keep exact remote, branch, commit IDs, and ahead/behind counts available
  through progressive disclosure.
- In a multi-project session, status and progress belong only to the originating
  project. Do not automatically check every open project.

# Out of scope

- Integrating, merging, rebasing, or checking out fetched commits.
- Automatic/background polling or filesystem/network watchers.
- Pruning remote-tracking branches.
- Adding, editing, or deleting remotes.
- Built-in provider login, clone, pull requests, or hosting-specific APIs.
- Fetching all open projects as a batch.
- Conflict resolution or divergent-history repair.

# Acceptance criteria

- [ ] Publish planning and team-change checking use one shared remote discovery
      and relation implementation.
- [ ] A manual check updates remote-tracking knowledge without changing `HEAD`,
      current branch, index, or working files.
- [ ] Up-to-date, ahead, behind, diverged, no-remote, no-upstream, detached,
      unborn, and unknown states are represented explicitly.
- [ ] Cached and fresh results are distinguishable and include a last-checked
      time.
- [ ] Multiple remotes never result in an implicit `origin` selection.
- [ ] Credentials are redacted from serialized data, logs, UI, and errors.
- [ ] Authentication, network, timeout, cancellation, and invalid-configuration
      outcomes preserve the last known truthful state without marking it fresh.
- [ ] Only implemented next actions appear enabled.
- [ ] Each project's status and in-flight request remain isolated when switching
      sessions.
- [ ] Spanish/English copy, keyboard access, focus, loading, stale, empty, and
      error states are complete.

# Required tests and audit

## Rust unit tests

- Remote/upstream parsing and selection.
- Credential redaction for HTTPS, SSH, SCP-like, file, and malformed URLs.
- Ahead/behind/diverged ancestry classification.
- Cached/fresh status mapping and structured failure classification.

## Rust integration tests

Use local bare remotes and separate clones for:

- no remote and no upstream;
- first upstream configuration;
- up-to-date, ahead, behind, and diverged histories;
- remote branch removed or rewritten;
- fetch rejection and unreachable remote fixtures;
- byte-for-byte unchanged worktree/index and unchanged local `HEAD`;
- exactly the intended remote-tracking refs updated.

## Frontend and desktop audit

- Every status card and transition from stale to loading to fresh/error.
- Remote choice with duplicate display names and long/non-ASCII refs.
- Switch projects while checking and ignore stale responses.
- Offline retry, cancellation, credential prompt/failure, and app relaunch with
  cached status.
- Light/dark, narrow/large window, keyboard, screen reader, and reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `work/active/011-publish-changes.md`
- `work/active/012-open-and-switch-projects.md`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- Task 011's provider-neutral remote discovery and publish preflight.
- Task 012's per-project session/request isolation.

# Decisions

- Fetch is user-triggered, never automatic in this task.
- Fetch may update remote-tracking metadata but never the current branch,
  history, index, or working files.
- No default remote name or hosting provider is assumed.
- Divergence is explained and blocked from automatic resolution.

# Implementation notes

Complete during implementation. Record the shared sync-service boundary, fetch
arguments, timeout/cancellation behavior, and redaction coverage.

# Validation

Record exact frontend, Rust, temporary-remote, desktop, accessibility, and
platform checks.

