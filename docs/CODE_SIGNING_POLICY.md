# Code-signing policy

Last updated: 2026-09-14

GitOdile publishes no package as operating-system-trusted unless corresponding
platform trust evidence exists. Windows x86-64 NSIS and Linux x86-64 AppImage
are the only pre-1.0 targets. Their source tag, provenance, checksums and Tauri
updater signatures remain mandatory. Windows Authenticode and all macOS
delivery are deferred until after `1.0.0` by
[ADR 0011](adr/0011-defer-windows-authenticode-and-macos-delivery-until-after-1.0.md).

## Pre-1.0 Windows policy

Windows previews and the initial `1.0.0` may use NSIS packages without
Authenticode. Evidence must say `authenticode_deferred`, the updater signature
must still verify, and download guidance must warn that Windows may show
SmartScreen or unknown-publisher prompts. Such packages must never be described
as Authenticode-signed or OS-trusted.

[Task 065-9-13](../work/active/app-updates/065-9-13-updater-evidence-and-os-signing.md)
owns the provider choice and Authenticode qualification, now intended for both
channels through SignPath Foundation rather than only after `1.0.0` (task
065-9-9 was folded into it on 2026-09-16). The provider must remain suitable
if future source development becomes private. No SignPath application has
been submitted yet.

Qualification between two public preview releases must preserve the same
honest deferred state; no preview pair is evidence of Authenticode unless task
065-9-13 records the signing evidence.

## Authorized roles and source

The GitHub organization owner `martinezelx` is currently the project maintainer,
committer, reviewer and release approver. A release candidate must originate
from a protected `v*` tag whose commit is contained in protected `main`. Only a
reviewed GitHub Actions artifact from the repository's pinned workflow may enter
a protected production signing request. Locally built or modified binaries are
not eligible for publication.

The release process separates build, updater signing, Windows OS signing and
public publishing. Protected GitHub environments hold the corresponding
credentials and require explicit approval. The destination publisher credential
is scoped to the public feedback repository and is not available to candidate
build jobs.

## Verification and incidents

Every enabled package must retain SHA-256 checksums and signed evidence. Windows
packages require Authenticode verification only after task 065-9-13 enables that
trust boundary; before then they record `authenticode_deferred`. Every updater
package must independently pass Tauri signature verification. Published version
assets are immutable; a correction receives a new higher version.

Suspected key, certificate or publisher-credential compromise freezes signing
and promotion. Maintainers preserve logs, revoke affected credentials with the
issuer, audit every potentially affected artifact and resume only with rotated
credentials and a new reviewed version. Details are maintained in the
[protected signed-build runbook](release/signed-builds.md).
