---
id: 065-3
title: Create or initialize a local project
status: active
priority: high
type: feature
areas:
  - repository
  - frontend
  - rust
  - sync
created: 2026-08-18
completed:
parent: "065"
queue: "02"
---

# Goal

Let a user create a new local Git project or safely turn an existing ordinary
folder into one, then optionally connect it to a remote URL.

# User outcome

A user starting from an idea or an existing non-Git folder can enter the
GitOdrile workflow without opening a terminal.

# Context

`open_repository` correctly rejects non-repositories. For `1.0.0`, that state
needs an explicit, previewed path to initialization rather than a generic
failure. This task is provider-neutral and does not create a hosted repository.

# Scope

- Add **Create new project** and contextual **Turn this folder into a project**
  entry points.
- Support creating one new named folder under a chosen parent and initializing
  an existing non-repository folder without modifying its current files.
- Let the user choose the initial version-line name and optionally add a README;
  show identity requirements before any initial saved version is created.
- Detect nested repositories, linked worktrees, existing `.git` files/folders,
  case/alias collisions, non-empty destinations, permissions, and races in Rust.
- Plan and revalidate all filesystem/config changes. On failure, remove only
  empty artifacts created and ownership-marked by this attempt; never clean an
  existing folder.
- Optionally connect a validated fetch/push remote URL through a separate
  previewed action, preserving existing configuration and redacting secrets.
- Open successful projects through the existing session lifecycle and present
  the correct unborn/first-save/publish guidance.

# Out of scope

- Creating a repository on GitHub or another hosting provider.
- Downloading `.gitignore`/license templates from the network.
- Importing files, project generators, submodule setup, or Git LFS setup.

# Acceptance criteria

- [ ] New-folder and existing-folder initialization work with spaces,
      non-ASCII, long paths, symlinks/aliases, and platform casing rules.
- [ ] Existing files remain byte-for-byte unchanged and nested/existing Git
      metadata is never overwritten.
- [ ] README/initial-version creation is explicit, hook/signing/identity aware,
      and leaves a truthful recoverable state on failure.
- [ ] Remote connection validates the exact name/URL, preserves existing Git
      config, redacts credentials, and integrates with check/publish flows.
- [ ] Every partial failure has exact cleanup ownership and cannot remove an
      existing directory or file.
- [ ] Empty, non-empty, invalid, permission, stale, success, and first-save
      states are accessible and localized.
- [ ] Temporary-directory integration tests and frontend journeys pass on the
      supported platforms, and `pnpm run check` passes.

# Relevant files

- `src/features/repository/`
- `src/features/overview/`
- `src-tauri/src/repository.rs`
- `src-tauri/src/tooling.rs`
- `src-tauri/src/sync.rs`

# Dependencies

- Task 065-1 baseline audit.
- Existing project/session, identity, save-version, and remote contracts.

# Decisions

- Initialization and hosted-repository creation are different outcomes; only
  local initialization belongs to `1.0.0`.
- Existing folders are never cleaned or populated implicitly.
- Remote connection is explicit and URL-based rather than provider-specific.

# Implementation notes

Record initialization arguments, initial branch compatibility, ownership and
rollback rules, remote validation, and unborn-state findings.

# Validation

Record fixture matrix, failure injection, desktop/accessibility checks,
platform coverage, and final check output.
