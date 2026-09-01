---
id: 065
title: Reach a trustworthy GitOdile 1.0.0
status: active
priority: high
type: epic
areas:
  - product
  - release
  - frontend
  - rust
  - platform
created: 2026-08-18
completed:
---

# Goal

Close the ordinary provider-neutral desktop Git workflow, prove it end to end,
and ship verified installable artifacts as GitOdile `1.0.0`.

# User outcome

A user can acquire or create a project, understand and save work, inspect its
history, collaborate through clean or conflicting changes, recover from
mistakes, and keep unfinished work for later without using a terminal.

# Context

GitOdile already contains most of the safe local commit and fast-forward sync
loop. The remaining work must be sequenced around dependencies rather than
implemented as unrelated screens. [`docs/ROADMAP.md`](../../../docs/ROADMAP.md)
is the authoritative release sequence and capability cut.

# Scope

- Deliver child tasks 065-1 through 065-8 in roadmap order.
- Complete existing tasks 015, 037, and 064 at their defined dependency points.
- Close the settled visual system across the release-candidate surface in task
  099 before final platform and distribution hardening.
- Keep the `1.0.0` contract provider-neutral and local-first.
- Maintain a release checklist mapping every advertised capability to automated
  tests and actual desktop evidence.
- Update README capabilities, version metadata, release notes, and support
  documentation only when the corresponding evidence exists.

# Out of scope

- Literal parity with every GitHub Desktop feature.
- Native provider accounts, pull requests, issues, checks, forks, and cloud-only
  collaboration.
- Worktrees, tags/releases, rebase, force push, cherry-pick, interactive
  history editing, and AI features.

# Acceptance criteria

- [ ] Gates 0–4 in `docs/ROADMAP.md` are complete in dependency order.
- [ ] Tasks 015, 037, 064, 099, and 065-1 through 065-8 are done with their own
      validation recorded.
- [ ] The release capability matrix has no unsupported path presented as
      working and no required path dependent on the terminal.
- [ ] The actual Windows, macOS, and Linux release artifacts pass their defined
      smoke, workflow, accessibility, credential, and update/rollback checks.
- [ ] No open known issue can silently lose work, misreport a remote outcome,
      bypass hooks/signing, or overwrite newer state.
- [ ] `pnpm run check` passes on the release commit and version metadata is
      consistent across npm, Cargo, Tauri, packages, and release notes.

# Relevant files

- `AGENTS.md`
- `README.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ROADMAP.md`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`
- `work/done/015-history-timeline.md`
- `work/active/037-guided-conflict-resolution.md`
- `work/active/064-set-changes-aside-safely.md`
- `work/done/099-close-the-visual-system-refactor.md`

# Dependencies

The delivered 001–063 foundation. Individual child dependencies are recorded
in each task and in the roadmap dependency map.

# Decisions

- `1.0.0` means a complete, safe universal Git loop and verified distribution,
  not provider feature parity.
- Audit before adding features; release claims follow evidence.
- Work on one implementation task at a time even though the release epic keeps
  the approved sequence visible.

# Implementation notes

Update as child tasks complete. Do not duplicate durable capability or release
rules from the roadmap here.

# Validation

Record the final release commit, CI runs, artifact hashes, signing/notarization
evidence, platform matrix, and full `pnpm run check` result.
