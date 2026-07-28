---
id: 012
title: Open and switch between multiple projects
status: active
priority: high
type: feature
areas:
  - frontend
  - rust
  - platform
created: 2026-07-27
completed:
---

# Goal

Allow several local Git projects to remain open in one GitOdrile window while
the user works in one active project at a time.

# User outcome

The user can open another project without replacing the current one, switch
between projects quickly, and return to the same screen and selection they left
in each project. Closing a project only removes it from GitOdrile; it never
changes or deletes repository content.

# Context

The frontend currently owns one global `project`, working-tree snapshot, view
history, selected diff, and operation state. Rust commands are already narrow
and receive a repository path, which is a good foundation: this task should
introduce project sessions in the frontend without turning Rust into a mutable
global repository store.

Tasks 010 and 011 add history and remote mutations. Every asynchronous response,
preview token, dialog, and progress state must remain bound to the session that
started it, even if the user switches projects before it finishes.

This is a single-window project switcher, not a multi-window or split-screen
feature.

# Scope

## Repository identity

- Extend repository discovery with a structured, stable session identity
  produced from Rust-validated canonical paths.
- Treat repeated selections inside the same worktree as the same open project,
  including path aliases, symlinks, relative paths, and case variants where the
  filesystem is case-insensitive.
- Treat linked Git worktrees as distinct project sessions because they have
  different working files and indexes.
- Retain `gitDir` and `commonGitDir` so operations can detect sessions that
  share Git references.
- Persist canonical project descriptors, not an opaque identifier that cannot
  be revalidated on the next launch.

## Frontend session model

- Replace the single-project state with a dedicated session store or reducer.
  Keep this domain state outside large visual components.
- Separate:
  - persisted descriptor: canonical path, order, and last active project;
  - per-project UI state: current view, navigation history, selected file or
    saved version, and scroll-restoration keys;
  - live snapshot: repository information, working-tree state, remote state,
    and last refresh time;
  - in-progress operation: kind, phase, cancellation/uncertain state, and
    blocking reason;
  - per-project loading and structured errors.
- Identify every async request with its session and a request generation/token.
  A late response must never update another project or overwrite newer data.
- Load expensive status/diff/history data lazily for the active session.
  Inactive sessions may show their last known status but must label stale data
  honestly.
- Keep global settings, Git diagnostics, theme, and application dialogs outside
  project sessions.

## Interaction and layout

- Add a compact project switcher to the top portion of the existing sidebar,
  without duplicating the GitOdrile brand block.
- Show the active project clearly and provide:
  - a list of open projects;
  - an **Open another project** action;
  - a per-project close action;
  - restrained indicators for unsaved changes, an operation in progress, or an
    error. Indicators must not rely on color alone.
- Keep primary navigation below the project switcher and apply it to the active
  project. Settings remains application-wide.
- In the collapsed sidebar and narrow layout, preserve project switching
  through an accessible popover/menu rather than squeezing labels.
- Add project-switching and open/close actions to the command palette.
- Support platform-appropriate keyboard switching (`Ctrl` on Windows/Linux,
  `Cmd` on macOS), without capturing shortcuts while the user is typing.
- Preserve focus logically after switching or closing. Announce the new active
  project to assistive technology without moving focus unexpectedly.

## Opening, switching, and closing

- Opening an already-open worktree activates its existing session instead of
  duplicating it.
- Opening failures belong to the attempted path and must not disturb current
  sessions.
- Switching projects must not cancel safe read-only work automatically. It must
  not retarget an open confirmation or operation.
- A mutation continues against its originating session and exposes progress on
  that project's indicator.
- Prevent closing a project while its mutation has an unresolved outcome.
  Explain that the user can switch projects while it finishes.
- For a project with unsaved files but no mutation, closing may use the existing
  confirmation preference and must explain that files stay on disk.
- Closing the active project selects a predictable adjacent session; closing
  the last project returns to the existing no-project state.

## Persistence and migration

- Replace the single `gitodrile-last-project-path` value with a versioned stored
  list, order, and active-project identity.
- Migrate the existing last-project preference once without losing it.
- Evolve “reopen last project” into “reopen projects from the previous
  session,” preserving the user's current preference where possible.
- Revalidate every stored path through `open_repository` on launch.
- Restore valid projects even when one stored path is missing, inaccessible, or
  no longer a repository; summarize skipped projects without blocking startup.
- Avoid persisting diffs, source contents, credentials, tokens, or raw Git
  errors.

## Operation coordination

- Bind task 010/011 plans and execution to an immutable session identity,
  canonical project path, and state token.
- Allow read-only operations in different projects to run independently.
- Initially serialize mutations that share a `commonGitDir`; return an
  understandable busy state instead of racing Git reference locks.
- Do not introduce background repository watchers in this task.

# Out of scope

- Multiple native windows or moving sessions between windows.
- Split view or two simultaneously visible project workspaces.
- Batch save, publish, fetch, or other actions across projects.
- Clone, remove from disk, rename, relocate, or delete a repository.
- Background filesystem watching or continuous polling.
- A full recent-project library, pinning, grouping, or cloud synchronization.
- Branch/workspace management.

# Acceptance criteria

- [ ] The user can keep at least two projects open and switch between them
      without reopening folders.
- [ ] Each session preserves its view, navigation history, selected item,
      snapshots, errors, and operation state.
- [ ] Nested paths, symlink aliases, and case aliases deduplicate to the same
      worktree where the platform requires it.
- [ ] Linked worktrees remain separate sessions while exposing their shared
      `commonGitDir` for mutation coordination.
- [ ] Late async responses cannot leak data or state into another session.
- [ ] Save/publish previews and executions remain bound to their originating
      project after switching.
- [ ] A project with an unresolved mutation cannot be closed; unsaved files are
      never discarded when closing a session.
- [ ] Valid sessions restore in order after restart and invalid stored paths do
      not prevent the others from opening.
- [ ] Existing single-project storage migrates safely.
- [ ] The switcher works in expanded, collapsed, and narrow layouts with long,
      duplicate, non-ASCII, and overflowing project names.
- [ ] Mouse, keyboard, command palette, screen reader labels, visible focus,
      reduced motion, Spanish, and English are verified.
- [ ] No repository source content, credentials, or operation tokens are stored
      in browser persistence.

# Required tests and audit

## Rust

- Canonical identity for root, nested folder, path alias, symlink/junction, and
  case variants where testable.
- Separate identities for linked worktrees and shared `commonGitDir`.
- Missing, unreadable, and no-longer-repository stored paths.

## Frontend

- Reducer/store transitions for open, deduplicate, activate, reorder, close,
  restore, and partial restore failure.
- Per-session view/selection preservation.
- Request-generation tests proving stale results are ignored.
- Mutation binding and shared-`commonGitDir` busy behavior.
- Storage migration, corrupt JSON, schema-version mismatch, and privacy-safe
  persisted payload.

## Desktop audit

- Real repositories plus two linked worktrees.
- Switch during status, diff, save preview, save execution, publish preview,
  publish execution, success, error, and uncertain result.
- Relaunch with 0, 1, several, missing, inaccessible, and renamed project
  folders.
- Windows path casing/junction behavior; macOS/Linux symlinks and case behavior.
- Responsive review around 1024px and large windows in light/dark themes.
- Keyboard-only and assistive-technology navigation with 1, 5, and 20 open
  projects.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `src/main.tsx`
- `src/changes.tsx`
- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/repositoryOverview.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- Task 010 for binding save operations to sessions.
- Task 011 for binding remote operations and uncertain outcomes to sessions.

# Decisions

- Use one window and one active project, with multiple retained sessions.
- Keep Rust commands path-scoped and stateless; do not add a globally mutable
  “current repository.”
- Deduplicate by Rust-resolved worktree identity, not display name or the
  originally selected folder.
- Preserve linked worktrees as distinct sessions and coordinate only their
  shared mutation boundary.
- Persist descriptors and UI continuity, not repository contents or live Git
  truth.

# Implementation notes

Complete during implementation. Record the final session model, storage schema,
migration behavior, shortcut choices, and any operation-coordination trade-offs.

# Validation

Record exact frontend, Rust, desktop, accessibility, and platform checks.

