---
id: 065-9-5
title: Build signed release artifacts in private CI
status: active
priority: high
type: feature
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed:
parent: "065-9"
queue: "04"
---

# Goal

Produce verified platform packages from checked source tags without exposing private source or signing secrets.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Implement private CI that validates tag syntax, main ancestry, exact source revision and agreement of all version metadata; ordinary branch pushes and merges do not publish.
- Build the required target matrix and sign final updater artifacts; handle OS signing and macOS notarization separately with trusted-job credentials.
- Provide protected validation builds for two forward versions without promoting public channel feeds, so updater qualification can precede a public release.
- Record artifact hashes, private source/build provenance, certificate identities and the key backup/rotation/loss procedure; do not log secrets or export private source archives.

# Out of scope

Public feed promotion, replacing finalized assets and the complete product QA matrix for 1.0.0.

# Acceptance criteria

- [ ] Wrong ancestry, version mismatch, unsupported prerelease suffix and channel disagreement fail before publication.
- [ ] Every enabled target produces its required package, updater signature and verification evidence; partial matrix failure cannot authorize feed promotion.
- [ ] Production secrets are restricted to trusted jobs; updater signing and OS trust checks are separately evidenced.
- [ ] Build/recovery instructions and real credential readiness are recorded; missing certificates or platforms remain explicit blockers to their production artifacts.

# Dependencies

065-9-1 through 065-9-4; production signing access for enabled targets.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record workflow validation, artifact/signature checks and trusted build runs, then pnpm run check.
