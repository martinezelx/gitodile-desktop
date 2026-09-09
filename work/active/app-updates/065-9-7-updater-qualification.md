---
id: 065-9-7
title: Qualify signed upgrades and release operations
status: active
priority: high
type: hardening
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed:
parent: "065-9"
queue: "05"
---

# Goal

Prove the complete updater with real signed builds before enabling production distribution.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Exercise two successively versioned signed builds for every enabled NSIS, macOS and AppImage target through the normal installation path; verify running-version confirmation after handoff.
- Verify preservation of settings, sessions, volatile drafts and dirty tracked/untracked files, including other projects, active operations and helpers.
- Exercise offline, missing feed/target, corruption, cancellation, low disk space, locked/read-only installs, interrupted handoff and reinstall; test managed-package fallback accurately.
- Validate the publisher in a controlled validation path before authorizing production feed promotion. Record platform/artifact evidence, residual limits and maintainer/user runbooks.
- Hand evidence and the working pipeline to 065-8, which requalifies final 1.0.0 artifacts and all later operation/draft integrations.

# Out of scope

Git credential hardening in 065-7, the final full-product audit in 065-8, and automatic rollback guarantees.

# Acceptance criteria

- [ ] Every advertised updater target has recorded A-to-B evidence with real packages; compilation or mocks alone cannot close a platform criterion.
- [ ] No operation or draft is lost, no Git history is changed, and failed installs do not produce false success or a forced downgrade.
- [ ] Publisher readiness covers full-matrix failure, retries, immutable assets and stable/preview promotion, including anonymous access.
- [ ] All parent epic acceptance criteria map to completed child evidence; missing credentials/platform testing leave affected work explicitly unfinished.
- [ ] pnpm run check and, before publication, pnpm run check:publication pass; no 1.0.0 readiness is claimed.

# Dependencies

065-9-1 through 065-9-6 and actual package/signing environments. Qualification uses validation builds/feeds before production promotion, avoiding a publication dependency cycle.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record build tags/SHAs, platform matrix, A-to-B results, failure cases, retained installers, CI evidence and final gates.
