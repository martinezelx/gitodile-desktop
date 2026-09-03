---
id: 065-9-4
title: Integrate update controls and preferences
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

Let users check, download and choose when to install updates with clear progress and recoverable errors.

# Context

Child of [epic 065-9](../release-1.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Create feature-owned controller, typed port and Tauri adapter; integrate Changelog, menu, command palette and Settings without component IPC.
- Support checking with no project open. Opening Changelog or navigating screens does not request updates; automatic checks default off and disclose GitHub contact when enabled.
- Implement the agreed cadence and coalescing, version/notes/progress/retry states, explicit install/restart confirmation and actionable busy/draft/manual-install guidance.
- Keep remote notes bounded plain text, local notes available offline, and English/Spanish copy accessible across themes, minimum window size and reduced motion.

# Out of scope

Channel picker, mandatory/silent installation, provider login and redesigning unrelated screens.

# Acceptance criteria

- [ ] All entry points share one coherent lifecycle and cannot duplicate checks/downloads/installation.
- [ ] Automatic checking is opt-in, sends no repository data or stable installation identifier, and follows the documented cadence.
- [ ] Keyboard, focus restoration, screen-reader announcements and unknown-length progress work in unavailable, offline, blocked and failure states.
- [ ] User-facing README/design guidance describes only implemented behavior and installation never bypasses native protection.

# Dependencies

065-9-3, including the draft/admission contract from 065-9-2.

# Implementation notes

Not implemented. Record decisions, changed files and evidence here; keep durable
architecture and operator guidance in docs and link them rather than duplicating them.

# Validation

Record controller/interaction tests, desktop accessibility evidence and pnpm run check.
