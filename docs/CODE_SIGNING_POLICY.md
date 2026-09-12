# Code-signing policy

Last updated: 2026-09-12

GitOdile publishes no desktop package until its source tag, build provenance,
checksums, updater signature and platform-specific trust evidence pass the
documented release gates. Windows x86-64 NSIS and Linux x86-64 AppImage are the
only targets in the current qualification matrix. macOS remains explicitly
disabled and is not advertised or published.

## SignPath open-source application

GitOdile is applying to the SignPath Foundation open-source code-signing
program. The application and this policy do not claim that sponsorship has
already been granted or that an unsigned package is trusted.

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

## Authorized roles and source

The GitHub organization owner `martinezelx` is currently the project maintainer,
committer, reviewer and release approver. A release candidate must originate
from a protected `v*` tag whose commit is contained in protected `main`. Only a
reviewed GitHub Actions artifact from the repository's pinned workflow may enter
a SignPath trusted-build signing request. Locally built or modified binaries are
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
