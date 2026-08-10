---
id: 045
title: Measure macOS and Linux desktop behavior and memory
status: active
priority: high
type: chore
areas:
  - platform
  - performance
  - frontend
created: 2026-08-10
completed:
---

# Goal

Run the task-023 desktop protocol on macOS and Linux, so the architecture's
performance and correctness claims stop being Windows-only assertions.

# User outcome

macOS and Linux users get an application whose behavior on their engine has been
observed rather than assumed.

# Context

Epic 022 closed with every budget measured on Windows 11 and WebView2, and no
desktop run on any other platform. CI runs the Rust job on ubuntu, windows and
macos, but the frontend job runs on ubuntu only and neither job launches the
app. Nothing in this project has ever executed inside WKWebView or WebKitGTK.

Three areas carry real risk rather than theoretical risk:

- **The file-list virtualization** added by task 031 is new code using
  `@tanstack/react-virtual` with absolutely positioned rows, `transform`
  offsets and `ResizeObserver` measurement. It was verified on WebView2 with a
  5,000-change fixture. Row measurement and scroll anchoring are exactly the
  areas where WebKit and Chromium diverge.
- **Keep-alive accessibility** depends on `hidden` plus `inert`. `inert` has a
  different support and behavior history in WebKit, and the guarantee it
  provides — a hidden screen cannot be tabbed into or announce status — is an
  accessibility contract, not an optimization.
- **Every memory number is Windows-only.** ADR 0004 scopes its private-bytes
  budget to Windows explicitly and states that reusing those numbers elsewhere
  is not authorized.

Task 023's protocol already defines the per-platform metric: resident and
private footprint on macOS, RSS and PSS from `smaps_rollup` on Linux.

The probes in `scripts/` attach over CDP, which is a WebView2 mechanism. macOS
and Linux need a different driver or a different approach, and finding that out
is part of this task rather than a surprise during it.

# Scope

- Run the task-023 desktop protocol on macOS and on Linux with a release build:
  startup ordering, warm switch p50/p95, first-diff latency, visible DOM counts,
  per-command Git process counts, settled idle processes and memory.
- Use both the standard fixture and the 5,000-change large fixture; the large
  one is what exercises virtualization.
- Verify keep-alive `hidden`/`inert` behavior with the platform's own assistive
  technology, not only by asserting the attributes are present.
- Record per-platform baselines and budgets in
  `docs/architecture/023-performance-baseline.md`, kept separate from the
  Windows numbers rather than merged into one row.
- Extend or replace the probes so they can drive the app on each platform, and
  document that in `scripts/README-031-probes.md`.
- File whatever the run finds as its own tasks. Finding a WebKit defect is a
  success for this task, not a failure.

# Out of scope

- Packaging, installers, code signing or notarization.
- Fixing platform defects this task discovers. Measure, record, file.
- Adding desktop launches to CI. If the run shows that is worthwhile, it is a
  separate task with its own runner-cost discussion.

# Acceptance criteria

- [ ] The task-023 protocol has been run on macOS and on Linux against a
      release build, with the commit, OS build, engine version and hardware
      recorded.
- [ ] Both fixtures were used, including the 5,000-change one.
- [ ] Virtualized scrolling, row measurement and selection are confirmed
      correct on both engines.
- [ ] `hidden`/`inert` keep-alive behavior is confirmed with real assistive
      technology on both platforms.
- [ ] Per-platform memory baselines exist and are not presented as comparable
      to the Windows figures.
- [ ] Any defect found is filed as its own task with a reproduction.
- [ ] `docs/architecture/023-performance-baseline.md` and ADR 0004 no longer
      describe cross-platform behavior as unmeasured.

# Relevant files

- `docs/architecture/023-performance-baseline.md`
- `docs/adr/0004-measure-desktop-memory-as-private-bytes.md`
- `scripts/README-031-probes.md` and the probes beside it
- `docs/ARCHITECTURE.md`, "Platform notes"

# Dependencies

Needs macOS and Linux hardware or VMs. This is the only task in epic 038 that
cannot be done from the current development machine, which is why it is filed
separately rather than folded into another task.

# Decisions

- Measure before fixing. An unmeasured platform produces speculative fixes, and
  the audit that closed epic 022 found two real defects precisely because it
  measured instead of reasoning.

# Implementation notes

Complete during implementation.

# Validation

Record every command, its platform and its result. Do not report a platform as
passing unless the protocol actually ran there.
