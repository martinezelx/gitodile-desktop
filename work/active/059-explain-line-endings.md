---
id: 059
title: Explain line endings instead of leaving them to bite
status: active
priority: normal
type: feature
areas:
  - frontend
  - rust
  - ux
created: 2026-08-15
completed:
---

# Goal

Show what Git is doing to line endings, in plain language, and let it be
changed from Settings without reading `git config` documentation.

# User outcome

A file that shows as changed when nothing was typed in it gets an explanation
instead of a mystery. Someone on Windows working with teammates on macOS can
set this once, deliberately, rather than discovering it through a diff that
claims every line changed.

# Context

This is the clearest case in the app for GitOdrile's whole thesis: a real Git
concept that is genuinely confusing, where the fix is one setting and the cost
of not knowing is a diff that looks catastrophic and is not.

`work/backlog.md` already carries "Detect changes caused only by line-ending
normalization" under Repository experience. That detection and this setting are
the same problem seen from two ends — the diagnosis and the control.

Nothing in `src-tauri` reads or writes `core.autocrlf` today; a grep over
`src-tauri/src` finds no mention of it.

# Scope

- Read and write `core.autocrlf` (and report `core.eol` when it is set)
  through the existing `SettingsPort`, which already owns global Git config
  for identity and is the natural home.
- A Settings group in the Git section offering the three meaningful choices,
  each labelled by what it does rather than by its config value, with the
  platform-appropriate one marked as recommended.
- Say which setting is in effect and where it came from — global config, a
  repository `.gitattributes`, or unset.

# Out of scope

- `.gitattributes` authoring. Reporting that a repository has one which
  overrides the global setting is in scope; editing it is not.
- The backlog's normalization *detection* in the Changes screen. This task
  gives that work a place to link to, and should not absorb it.
- Any automatic renormalization of an existing working tree.

# Acceptance criteria

- [ ] The current effective value is shown, including "not set".
- [ ] Changing it writes the global Git config and the new value survives a
      restart of the app.
- [ ] A repository whose `.gitattributes` overrides the global setting says so
      rather than reporting a value that is not in effect.
- [ ] Each option is described in a sentence that never requires the reader to
      know what `autocrlf` means.
- [ ] Rust tests cover reading an unset value, reading each set value, and
      writing.
- [ ] Full `pnpm run check` passes.

# Relevant files

- `src-tauri/src/tooling.rs` (system-Git settings live here per `AGENTS.md`)
- `src/features/settings/port.ts`, `tauriAdapter.ts`, `SettingsPanel.tsx`
- `src/features/settings/translations.ts`

# Dependencies

None. Related to the backlog item on normalization detection, which stays in
the backlog.

# Decisions

Record task-specific decisions and why they were made.

# Implementation notes

Complete this section during implementation. Mention important files changed,
trade-offs, migrations, and follow-up work.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.
