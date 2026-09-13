# Code-signing policy

Last updated: 2026-09-12

GitOdile offers no desktop package as a trusted general public download until
its source tag, build provenance, checksums, updater signature and
platform-specific trust evidence pass the documented release gates. Windows
x86-64 NSIS and Linux x86-64 AppImage are the only targets in the current
functional qualification matrix. macOS remains explicitly disabled and is not
advertised or published.

## Controlled validation exception

The active `0.2.0-preview.4` to `0.2.0-preview.5` qualification may use a Windows
NSIS package that lacks Authenticode solely to prove the independently signed
Tauri updater lifecycle. Its evidence must say `authenticode_deferred`, its
updater signature must still verify, and it may appear only on the controlled
validation host. It must not be described as a trusted public release.

[Task 065-9-9](../work/active/app-updates/065-9-9-authenticode-public-delivery.md)
owns the future provider choice, Authenticode qualification and general public
Windows distribution. The provider must remain suitable if future source
development becomes private. No SignPath application was submitted.

The earlier `.2` to `.3` validation packages remain immutable failed evidence
and are not an active qualification pair. Public production-key qualification
continues later with `.6` to `.7` after Authenticode is available.

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
packages must pass Authenticode verification with online chain and revocation
checks. Every updater package must independently pass Tauri signature
verification. Published version assets are immutable; a correction receives a
new higher version.

Suspected key, certificate or publisher-credential compromise freezes signing
and promotion. Maintainers preserve logs, revoke affected credentials with the
issuer, audit every potentially affected artifact and resume only with rotated
credentials and a new reviewed version. Details are maintained in the
[protected signed-build runbook](release/signed-builds.md).
