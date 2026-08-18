---
id: 065-1
title: Prove the existing core workflow end to end
status: active
priority: high
type: audit
areas:
  - frontend
  - rust
  - testing
  - desktop
created: 2026-08-18
completed:
parent: "065"
queue: "01"
---

# Goal

Establish a repeatable, evidence-backed baseline for everything GitOdrile
already claims before new `1.0.0` features are developed.

# User outcome

The current open → inspect → save → check → get → publish workflow behaves as
one coherent product, including errors, restart, and recovery, rather than only
as individually tested features.

# Context

Unit and feature tests are extensive, but the project does not yet own one
release-oriented end-to-end capability matrix. This audit is the immediate
next task and may fix defects in delivered behavior; it must not add missing
roadmap features.

# Scope

- Define fixtures for a new local project, clean tracked project, dirty project,
  configured remote, ahead, behind, diverged, detached, unborn, conflicted, and
  unavailable/malformed remote states.
- Exercise open from root/nested path, recent switching, close/reopen, status,
  diff, selected/all save, discard/Undo, branch create/switch/delete, check,
  fast-forward get, and publish as connected journeys.
- Verify hooks, signing/identity errors, watcher invalidation, stale plans,
  operation locking, uncertain outcomes, keyboard/focus, both locales/themes,
  and restart boundaries already promised by the current product.
- Produce a capability matrix with automated, Windows desktop, CI-only, and
  currently unmeasured evidence distinguished explicitly.
- Fix only regressions or contract gaps in already-delivered features and add
  the narrowest missing integration tests.

# Out of scope

- Clone, project creation, History, non-fast-forward integration, conflict
  resolution, Recovery screen, stashes, or provider login.
- Broad visual redesign or architecture migration.
- Claiming macOS/Linux runtime evidence that was not observed.

# Acceptance criteria

- [ ] A documented matrix maps every README capability to at least one
      automated check and identifies required manual desktop evidence.
- [ ] One hermetic test journey covers open, inspect, save, fetch/check,
      fast-forward get, publish, and reopen against real Git repositories.
- [ ] Connected branch and discard/Undo journeys are verified.
- [ ] Diverged/conflicted cases stop safely and point to the correct planned
      future capability without raw or misleading errors.
- [ ] Existing loading, empty, stale, partial, failure, uncertain, restart, and
      accessibility states are audited; discovered defects are fixed or logged
      as scoped follow-ups with severity.
- [ ] README and roadmap current-state claims match the evidence exactly.
- [ ] `pnpm run check` passes and the exact Windows desktop audit environment is
      recorded; non-Windows limitations remain explicit.

# Relevant files

- `README.md`
- `docs/ROADMAP.md`
- `docs/architecture/023-performance-baseline.md`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`
- `src-tauri/src/tests/`
- `src/**/*.test.ts*`

# Dependencies

Tasks 001–063 and the current main branch baseline.

# Decisions

- Test user journeys across feature boundaries rather than duplicating every
  existing feature test.
- A discovered missing capability belongs to its roadmap task; a broken claim
  in delivered behavior belongs here.

# Implementation notes

Record fixture design, defects found, narrow fixes, and the final capability
matrix location.

# Validation

Record focused commands, the aggregate check, desktop steps, OS/WebView/Git
versions, and any environment not exercised.
