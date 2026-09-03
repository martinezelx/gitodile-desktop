---
id: 065-9-1
title: Define updater contracts and supported installations
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
queue: "01"
---

# Goal

Agree the version, channel, target and installation contracts before integrating the updater.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Inventory current versions, package formats, app identity, supported architectures and installation locations; distinguish NSIS, macOS app bundles, AppImage, managed packages, mounted/read-only and unsupported installs.
- Define typed updater states, errors, cancellation, network and payload bounds, build-derived channel selection and immutable candidate identity. Record exact dependency choices and source evidence during implementation.
- Record production endpoint ownership, updater-key custody and backup, publisher credential scope and OS certificate requirements without secrets. Identify unavailable signing/platform resources early.
- Define forward test versions and the release contract: matching npm/Cargo/Tauri/tag/feed versions, exact merged commit in main, preview suffix and GitHub prerelease flag.

# Out of scope

No updater installation, public publication or broad Git credential diagnostics.

# Acceptance criteria

- [ ] The target/install matrix states automatic-update eligibility and manual fallback for every advertised package; no untested platform is claimed supported.
- [ ] Version/channel/target cases cover same/older versions, preview ordering, stable rejecting preview, missing targets and unsupported suffixes.
- [ ] ADR 0010 remains the durable contract; deviations are explained there. Production credentials and platform prerequisites have owners and recorded availability, without placeholders presented as configured.
- [ ] The implementation has a bounded state/error contract and a concrete two-build validation plan.

# Dependencies

Existing Tauri shell, release metadata and ADR 0010; no dependency on unfinished conflict, stash or Git credential hardening tasks.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record contract fixtures, target evidence, prerequisite availability and pnpm run check results.
