---
id: 065-9-9
title: Add trusted Windows signing before general public distribution
status: active
priority: high
type: hardening
areas:
  - release
  - platform
  - security
  - documentation
created: 2026-09-12
completed:
parent: "065-9"
queue: "23"
---

# Goal

Add publicly trusted Windows Authenticode signing and qualify the production
preview publication path before GitOdile is offered as a general public Windows
download.

# Context

The maintainer narrowed task 065-9-8 on 2026-09-12 to functional updater
qualification with real Tauri signatures. Windows validation packages may be
unsigned at the operating-system layer and must be labelled as internal test
artifacts. This is sufficient to prove Tauri package authentication and the
installed A-to-B lifecycle, but it does not establish a trusted Windows
publisher or remove SmartScreen warnings.

The source repository remains public during the current GitHub Actions testing
phase, but future development may be private. Do not assume eligibility for an
OSS-only signing sponsorship. No SignPath application was submitted.

# Scope

- Select a sustainable Windows code-signing provider compatible with the
  project's ownership and expected future source visibility.
- Store signing authority only in the protected production Windows environment;
  prefer a managed HSM or service identity over exportable key material.
- Exercise the existing production Authenticode path or replace it with a
  reviewed remote-signing integration while keeping Actions commit-pinned and
  least-privileged.
- Produce two consecutive production-key previews, verify Authenticode chain,
  revocation and timestamp evidence, publish immutable assets to
  `martinezelx/gitodile-feedback`, and prove anonymous downloads plus the real
  public `.4` to `.5` updater transition.
- Update public download guidance only after the evidence passes.

# Out of scope

- Treating a self-signed certificate, a Tauri updater signature or an unsigned
  validation build as equivalent to Authenticode.
- Publishing macOS artifacts or a stable release.
- Declaring GitOdile 1.0.0 ready.

# Acceptance criteria

- [ ] The selected provider and certificate identity are documented without
      secrets and remain usable under the intended source-repository visibility.
- [ ] Protected CI produces timestamped Windows NSIS bytes whose Authenticode
      signature passes online chain and revocation verification.
- [ ] Production Windows packages retain a distinct valid Tauri updater
      signature in addition to Authenticode.
- [ ] Two immutable preview releases and `preview.json` pass destination-scoped
      publication, anonymous hash verification and real installed `.4` to `.5`
      update evidence.
- [ ] Internal unsigned validation artifacts are never described as trusted
      public downloads, and production continues to fail closed without
      Authenticode.
- [ ] `pnpm run check` and `pnpm run check:publication` pass on the exact
      enabling commit.

# Dependencies

- Completed controlled updater qualification from 065-9-8.
- A real Windows x86-64 test device.
- A publicly trusted code-signing provider and protected credentials.
- A destination-scoped publisher credential for `gitodile-feedback`.
