---
id: 061
title: Put change watching and discard confirmation under the user's control
status: active
priority: normal
type: feature
areas:
  - frontend
  - ux
  - safety
created: 2026-08-15
completed:
---

# Goal

Two controls the app currently decides on its own: whether it watches the
working tree for changes, and whether discarding changes asks first.

# User outcome

Someone working on a huge repository or a network drive can stop the automatic
refresh instead of living with it. Someone who discards changes often can stop
being asked — deliberately, once, rather than by clicking through a dialog
every time.

# Context

These two are grouped because each is small on its own and both are about the
same thing: a behavior the app currently fixes, that a user has a legitimate
reason to want the other way.

Task 019 designed watching and task 020 delivered it. `work/backlog.md` already
flags the open risk — "Design repository watching, cancellation, and
large-repository performance tests before adding continuous background
refresh" — and the large-repository test suite is still unrefined there. A
switch is the honest interim answer while that measurement is outstanding.

`DiscardChangesDialog` always confirms. That is the right default and must
stay the default; this task only makes it a choice.

# Scope

- A "watch this project for changes" preference in the Settings General
  section, default on, honored by the watcher orchestration.
- A "confirm before discarding changes" preference in the Safety group,
  default on, honored by the Changes discard flow.
- When watching is off, the Changes screen must say so and offer a manual
  refresh — an unwatched screen that looks live is worse than no watching.
- Extend the task-057 "reset this section" to cover both.

# Out of scope

- A configurable watch interval or debounce. Off/on first; a number needs the
  benchmark from the backlog to pick a range honestly.
- Turning the discard confirmation off *by default*, now or later.
- The large-repository performance suite itself, which stays in the backlog.

# Acceptance criteria

- [ ] With watching off, no filesystem watcher is registered for the project —
      asserted, not assumed.
- [ ] With watching off, the Changes screen states that it is not updating
      itself and offers a refresh.
- [ ] Turning watching back on re-registers the watcher and refreshes once,
      without requiring the project to be reopened.
- [ ] With the discard confirmation off, discarding proceeds directly; with it
      on, the existing dialog is unchanged.
- [ ] Both preferences default to on and survive a restart.
- [ ] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiscardChangesDialog.tsx`, `ChangesPanel.tsx`
- `src/features/settings/SettingsPanel.tsx`, `translations.ts`
- `src/app/preferences.ts`, `src/main.tsx`
- `src-tauri/src/lib.rs` (watcher orchestration)

# Dependencies

Extends the General and Safety groups from task
[057](../done/057-right-size-settings-and-about.md).

# Decisions

Record task-specific decisions and why they were made.

# Implementation notes

Complete this section during implementation. Mention important files changed,
trade-offs, migrations, and follow-up work.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.
