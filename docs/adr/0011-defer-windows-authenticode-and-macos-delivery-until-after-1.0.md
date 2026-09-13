# ADR 0011: Defer Windows Authenticode and macOS delivery until after 1.0

Date: 2026-09-14

## Context

GitOdile has proved the Tauri updater lifecycle on a real Windows installation
with a distinct validation updater key. Publicly trusted Windows Authenticode
still requires an identity-validated certificate or managed signing service,
ongoing custody and incident-response obligations. The maintainer does not want
to establish that trust boundary while the product is still changing rapidly.

macOS delivery additionally requires Apple hardware for representative runtime
and installed-update evidence, plus Developer ID signing and notarization. No
such device is currently available, and buying one solely to qualify the
pre-1.0 release is not justified.

Linux AppImage delivery does not use Authenticode. Windows and Linux updater
packages still use Tauri's cryptographic updater signature; that signature
authenticates GitOdile updates but does not make Windows trust the publisher.

## Decision

- Continue development, previews and the initial `1.0.0` scope on Windows
  x86-64 NSIS and Linux x86-64 AppImage without Windows Authenticode.
- Keep the Tauri updater signature, checksums, provenance, immutable assets,
  explicit install consent and all existing updater safety checks mandatory.
- Label Windows downloads honestly as lacking a publicly trusted publisher;
  do not claim that the Tauri signature removes SmartScreen or unknown-publisher
  warnings.
- Keep both macOS targets disabled, absent from feeds and unsupported in release
  claims through `1.0.0`.
- Schedule selection and qualification of a Windows signing provider, and real
  macOS signing/notarization/runtime qualification, after `1.0.0`. Neither is a
  gate for the initial `1.0.0` release.
- Do not apply for SignPath Foundation or purchase/configure another signing
  service as part of the pre-1.0 roadmap.

## Consequences

- Windows users installing direct downloads may see SmartScreen and
  unknown-publisher warnings. Documentation must state this before download.
- `1.0.0` can support only the qualified Windows and Linux targets; it cannot
  advertise macOS support.
- Release automation must distinguish updater authenticity from operating-
  system publisher trust and must record Authenticode as deliberately deferred,
  not passed.
- General availability can proceed without pretending the Windows package has
  OS-level publisher trust, provided the remaining Windows/Linux qualification
  gates pass.
- Tasks 065-9-9 and 065-10 retain their permanent IDs and technical acceptance
  criteria but become post-`1.0.0` work.

## Alternatives considered

- **SignPath Foundation before 1.0.** Potentially free for an eligible open-
  source project, but it introduces an external approval and signing authority
  before the maintainer wants that operational commitment.
- **A paid managed signing service before 1.0.** Technically suitable, but its
  identity, cost and key-custody decisions are premature at the current stage.
- **Publish macOS from CI without real Apple-device validation.** Rejected
  because compilation is not evidence of installation, Gatekeeper behavior or
  safe updater replacement on representative Macs.
- **Treat the Tauri updater signature as Authenticode.** Rejected because the
  two signatures establish different trust properties.
