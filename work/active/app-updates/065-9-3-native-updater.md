---
id: 065-9-3
title: Implement the native signed updater lifecycle
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

Check, download, verify and explicitly install one application update through the protected Rust service.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Integrate the official Tauri updater behind a narrow Rust owner and typed IPC; keep lib.rs registration-only and renderer capabilities minimal.
- Coalesce checks, validate channel/version/target, bound networking and remote notes, retain only one candidate and support accurate download/verification/ready/error/cancel/retry states.
- Measure package transfer and peak memory limits, including anticipated bundled Git size; invalid signatures or truncated data never become installable.
- Invoke installation only through native admission and explicit consent. Handle Windows exit, platform install modes and post-launch running-version verification with bounded handoff state.

# Out of scope

User interface, live release publishing and claiming cross-platform installation success from mocks.

# Acceptance criteria

- [ ] No renderer command accepts arbitrary URLs, keys or installer paths, and direct updater/process permissions cannot bypass admission.
- [ ] Offline, timeout, HTTP, malformed manifest, missing target, no update and invalid upgrade are distinct and tested.
- [ ] Known/unknown download sizes, cancellation, corruption, retry and resource release behave truthfully; failed verification cannot install.
- [ ] Install handoff and startup confirmation report only observed success; failure offers reinstall guidance without a forced downgrade or success loop.

# Dependencies

065-9-1 and 065-9-2.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record native/IPC contract tests, signature fixtures, memory measurements, handoff failure cases and pnpm run check; real installs belong to 065-9-7.
