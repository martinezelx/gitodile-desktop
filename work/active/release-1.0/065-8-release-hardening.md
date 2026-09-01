---
id: 065-8
title: Verify and distribute GitOdile 1.0.0
status: active
priority: high
type: release
areas:
  - release
  - platform
  - accessibility
  - performance
  - security
  - documentation
created: 2026-08-18
completed:
parent: "065"
queue: "17"
---

# Goal

Freeze features, validate the full product on representative systems, and ship
signed, updateable, supportable `1.0.0` artifacts.

# User outcome

Users can install GitOdile from a trusted package, complete every advertised
workflow on their platform, update safely, and understand compatibility and
support boundaries.

# Context

Compilation and unit/integration CI are not runtime, packaging, signing,
credential, accessibility, or update evidence. ADR 0006 explicitly defers
macOS/Linux runtime validation to this task.

# Scope

- Freeze the `1.0.0` capability matrix and triage every open defect by data-loss,
  remote-integrity, correctness, accessibility, security, and usability risk.
- Run the full Gate-0 workflow plus clone/create/history/integration/conflict/
  recovery/stash journeys from actual packaged artifacts on representative
  Windows, macOS, and supported Linux environments.
- Execute large-repository, long-running process, watcher, memory, startup,
  screen-switch, keyboard, screen-reader, zoom, forced-colors, reduced-motion,
  locale, path, line-ending, symlink, casing, lock, and credential matrices.
- Produce signed Windows installers, signed/notarized macOS packages, and
  documented Linux packages/distributions with reproducible CI provenance and
  artifact hashes.
- Implement and verify an update strategy with signature verification, staged
  failure behavior, rollback/reinstall instructions, and no silent repository
  mutation during update.
- Complete versioning, release notes, privacy/security/support docs, install and
  uninstall behavior, crash/log locations, known limitations, and upgrade tests.
- Run an independent final safety audit and the aggregate repository gate.

# Out of scope

- Adding features after freeze to improve competitive parity.
- Claiming support for an untested OS/distribution/architecture.
- Telemetry, accounts, or a mandatory update service.

# Acceptance criteria

- [ ] Every roadmap Gate 0–3 task is done and the frozen matrix maps advertised
      behavior to automated plus actual-artifact evidence.
- [ ] No open blocker/critical issue can lose work, corrupt state, expose a
      credential, misreport a remote result, or prevent a primary workflow.
- [ ] Representative Windows, macOS, and documented Linux artifacts pass the
      complete smoke/workflow/platform/accessibility matrix from clean installs.
- [ ] Signing/notarization/package provenance and hashes verify through the
      normal installation path; uninstall preserves user repositories.
- [ ] Update success, unavailable update, interrupted download/install, invalid
      signature, rollback/reinstall, and older-settings migration are tested.
- [ ] Startup, memory, interaction, large-repository, watcher, and process
      results are recorded against retained budgets with no unexplained regressions.
- [ ] README, changelog/release notes, privacy, security, install, update,
      troubleshooting, support, and known-limitations docs match shipped behavior.
- [ ] Version metadata is `1.0.0`, `pnpm run check` passes on the release commit,
      CI is green, and artifact/version provenance is recorded.

# Relevant files

- `README.md`
- `SECURITY.md`
- `docs/ROADMAP.md`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`
- `docs/architecture/023-performance-baseline.md`
- `.github/workflows/`
- `src-tauri/tauri.conf.json`
- `package.json`
- `src-tauri/Cargo.toml`

# Dependencies

- Tasks 015, 037, 064, and 065-1 through 065-7 complete.
- Access to representative Windows, macOS, and Linux QA/signing environments.

# Decisions

- Feature freeze begins when this task starts.
- Support claims follow actual packaged-artifact evidence.
- Release signing, update safety, and rollback are correctness requirements.

# Implementation notes

Record supported OS/distribution/architecture matrix, signing identities and CI
design without secrets, artifact formats, updater decision/ADR, defects fixed,
and residual known limitations.

# Validation

Record release commit/tag, CI URLs, artifact hashes, signing/notarization
verification, platform hardware/software matrix, full QA results, independent
audit, and final aggregate check.
