---
id: 065-2
title: Clone and open a remote project safely
status: active
priority: high
type: feature
areas:
  - repository
  - sync
  - frontend
  - rust
  - platform
created: 2026-08-18
completed:
parent: "065"
queue: "01"
---

# Goal

Add a provider-neutral clone flow that turns a remote URL or Git path into a
verified open GitOdrile project without overwriting local content or leaving an
ambiguous partial project.

# User outcome

From the first-run and project-switcher surfaces, the user can paste a remote
location, choose a local parent/name, review the destination, clone, and begin
working in the opened project.

# Context

Opening existing local projects works; cloning is the largest missing entry
path. The system Git executable remains the backend. Authentication uses the
user's configured Git credential helpers for `1.0.0`; GitOdrile must classify
failures and never log secrets.

# Scope

- Add clone entry points to the empty state, project switcher, command palette,
  and appropriate titlebar menu without creating a new permanent screen.
- Validate and normalize supported HTTPS, SSH, Git, file URL, and local path
  inputs in Rust; redact credentials, query strings, and fragments everywhere.
- Plan destination, branch/default behavior, local effects, network effects,
  credential expectations, and cancellation consequences before execution.
- Clone into a uniquely owned staging directory under the selected parent,
  verify repository identity and worktree usability, then publish it to the
  exact empty destination without overwriting an existing path.
- Provide bounded progress, cancellation, timeout, retry, offline, certificate,
  host-key, authentication, not-found, disk, permission, long-path, and partial
  cleanup states. Retain evidence and offer safe cleanup if the outcome is
  uncertain.
- Open the verified clone through the existing project/session lifecycle and
  remember the successful parent location without storing credentials.
- Cover shallow/submodule/LFS discovery truthfully: normal clone is supported;
  specialized controls and automatic dependency installation are not.

# Out of scope

- Browsing repositories from a provider account, forking, pull requests, or
  OAuth/device-flow login.
- Partial clone, sparse checkout, recursive submodule initialization, or LFS
  installation/configuration.
- Deleting an existing destination to make room.

# Acceptance criteria

- [ ] Public HTTPS/SSH, authenticated-helper, file URL, and local-path clones
      either open a verified project or return a structured actionable error.
- [ ] Existing/non-empty destinations, alias/case collisions, nested invalid
      destinations, and path races block without modifying user content.
- [ ] Success exposes no staging directory and partial/cancelled/failed outcomes
      can clean only GitOdrile-owned paths after exact-path verification.
- [ ] Credentials and authenticated remote details never appear in UI-safe
      diagnostics, logs, state, recent projects, or IPC fixtures.
- [ ] Progress and cancellation remain responsive; late responses cannot open a
      closed/replaced session.
- [ ] Windows, macOS, and Linux path/process behaviors have integration coverage
      and actual desktop evidence is recorded where available.
- [ ] English/Spanish copy, keyboard/focus/screen-reader behavior, both themes,
      narrow layouts, and every empty/loading/error/success state are complete.
- [ ] IPC, execution policies, capabilities, docs, and tests are updated and
      `pnpm run check` passes.

# Relevant files

- `src/features/repository/`
- `src/projectSessions.ts`
- `src-tauri/src/repository.rs`
- `src-tauri/src/sync.rs`
- `src-tauri/src/git.rs`
- `src-tauri/src/application.rs`

# Dependencies

- Task 065-1 baseline audit.
- Existing task-012 project/session lifecycle and bounded Git runner.
- Task 065-7 later performs the release-wide credential matrix; this task must
  still ship truthful clone-specific classification and tests.

# Decisions

- Use system Git and configured credential helpers; provider login is deferred.
- Stage under the selected parent and publish only after verification so safe
  cleanup never targets an arbitrary user directory.
- Clone is a repository acquisition workflow, not a reusable shell-command UI.

# Implementation notes

Record supported URL grammar, staging/publish algorithm, progress protocol,
cancellation semantics, cleanup ownership marker, and platform findings.

# Validation

Record temporary-remote fixtures, credential-helper test setup, failure
injection, desktop audits, platform coverage, and final check output.
