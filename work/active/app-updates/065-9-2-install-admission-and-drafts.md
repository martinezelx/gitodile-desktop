---
id: 065-9-2
title: Protect operations and drafts before app installation
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
queue: "02"
---

# Goal

Create native application-wide install admission and preserve volatile user work before installer handoff.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Inventory all current project/global mutations, clone/create, hooks, credential helpers, background reads and watchers across every project; integrate admission at the native ownership boundaries.
- Make install admission atomic with starting new work. Drain or stop safe background work normally; never terminate a mutation. Release admission after blocked or failed pre-install attempts.
- Inventory save-message, settings and any existing editor drafts; persist and restore safely or return an actionable install blocker independent of mounted screens.
- Define how future conflict, integration and stash operations register with admission. Implement protection for existing paths now; require later features to extend it.

# Out of scope

Download transport, installer invocation, future conflict/stash feature implementation and credential-helper hardening from 065-7.

# Acceptance criteria

- [ ] Race tests prove a new mutation and installer cannot both acquire admission, including another project, clone/create and global helpers.
- [ ] Every existing operation has a documented admission/drain policy; failure restores normal operation and no mutation is killed.
- [ ] Draft preservation/blocking survives project switching and screen unmounting; tracked/untracked files and Git history remain untouched.
- [ ] Architecture docs explain the extension contract for future operations and drafts.

# Dependencies

065-9-1 contracts and the existing native operation/session owners.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record operation/draft inventory, concurrency and recovery tests, temporary-repository evidence and pnpm run check.
