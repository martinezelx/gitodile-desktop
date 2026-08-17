---
id: 060
title: Let a project use a different identity
status: active
priority: normal
type: feature
areas:
  - frontend
  - rust
  - architecture
created: 2026-08-15
completed:
---

# Goal

Allow the Git identity to be overridden for the open project, and make it
obvious which identity a saved version will actually carry.

# User outcome

Work commits stop going out under a personal address, and the reverse. Which
name and email the next saved version will use is visible before saving, not
discovered in the history afterwards.

# Context

GitOdrile only writes the global identity today. `SettingsPort.setIdentity`
takes a name and email and nothing else, and the panel's own copy says as much:
"a normal, global Git setting — not stored only inside GitOdrile".

The failure this prevents is silent and slow. Nothing warns you; the wrong
address just accumulates in the history until someone notices, and rewriting
authorship after the fact is exactly the kind of history surgery GitOdrile
exists to keep people away from.

This one carries an architectural cost worth stating up front. The settings
port is deliberately the *only* app-level feature whose native calls are
global — `port.ts` says so and explains that none of its calls take a project
path or session epoch, "because they inspect and change the machine's Git
installation, not an open repository". A per-project identity breaks that
property. Either the port grows a repository-scoped pair of calls alongside the
global ones, or the per-project identity belongs to a different feature that
already owns the open repository. Decide that before writing the command.

# Scope

- Read and write the repository-local identity (`git config --local`) for the
  open project.
- A Settings presentation that shows the global identity and, when a project is
  open, whether it is overridden for that project — with a way to set and to
  clear the override.
- Show the effective identity where a version is actually saved, so the choice
  is visible at the moment it matters and not only in Settings.
- Resolve and record the port-shape decision described above in `# Decisions`,
  and reflect it in `docs/ARCHITECTURE.md` if the boundary moves.

# Out of scope

- Conditional includes (`includeIf` in the global config), which solve the same
  problem by directory. Worth its own evaluation; not this task.
- Rewriting the authorship of versions already saved.
- Signing keys, SSH or GPG.

# Acceptance criteria

- [ ] With no override, a project reports the global identity and says it is
      global.
- [ ] Setting an override writes only the repository's local config and leaves
      the global one untouched — asserted in a Rust test against a real
      temporary repository.
- [ ] Clearing an override removes the local keys rather than blanking them.
- [ ] The identity a save will use is visible from the save-version flow.
- [ ] Switching the active project updates what Settings reports.
- [ ] The architecture guard still passes, with the boundary decision written
      down rather than worked around.
- [ ] Full `pnpm run check` passes.

# Relevant files

- `src/features/settings/port.ts` (read its opening comment first)
- `src/features/settings/tauriAdapter.ts`, `SettingsPanel.tsx`
- `src-tauri/src/tooling.rs`, `src-tauri/src/ipc.rs`
- `src/features/save-version/`
- `docs/ARCHITECTURE.md`

# Dependencies

Touches the identity group reshaped by task
[057](../done/057-right-size-settings-and-about.md).

# Decisions

Record task-specific decisions and why they were made. The port-scope question
above must be answered here.

# Implementation notes

Complete this section during implementation. Mention important files changed,
trade-offs, migrations, and follow-up work.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.
