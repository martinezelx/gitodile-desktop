# Signed updater qualification

This runbook executes tasks 065-9-7 and 065-9-8 without weakening the release
boundary in [ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It is an evidence procedure, not permission to create tags, use credentials, or
publish a release.

## Qualification route

Qualification uses the same builds, key, feed and release pipeline that users
receive. There is no test-only signing profile, controlled feed or fixed
version pair: every build embeds exactly the reviewed production updater
public key, derives its feed from its own version's channel, and can only be
routed to `stable.json` or `preview.json` in `martinezelx/gitodile`.

A qualified target is proven by one **A-to-B transition between two real,
consecutive public preview releases** published by the release pipeline in
`preview-testing` mode. Which two versions form the pair is data recorded in
the evidence, not a value in code: the validator only requires that both are
`X.Y.Z-preview.N` versions published to the public repository, that B is
newer than A, and that B was served to the installed A through the public
`preview.json` feed.

Every build carries the compile-time
`GITODILE_TEST_UPDATE_TARGETS=windows-x86_64,linux-x86_64` gate so an
installed preview — and, since task 065-9-12, an installed `stable-testing`
release — can perform a real update before either target is qualified. That
gate claims nothing; `GITODILE_QUALIFIED_UPDATE_TARGETS` stays empty until
the registry below records both enabled targets as qualified, and the
`production` mode stays reserved for that registry.

## Per-target execution

Install A from its public release page using the normal first-install
artifact and advertised installation mode on each enabled real target:
Windows x86-64 per-user NSIS and Linux x86-64 AppImage. Record the OS version,
architecture, install path class and whether hardware or a VM was used.
Before requesting B, create identifiable settings, open project sessions, a
volatile save-version draft, dirty tracked and untracked files in the active
project and another project, and a representative active operation/helper.
Capture repository HEAD/index/worktree identities.

Complete the in-app check, download, verification, second confirmation,
handoff and restart against the public feed. Independently confirm that the
running version changed from A to B. Recheck every sentinel and prove Git
history is unchanged. Retain both signed-matrix hashes, source tags/full SHAs,
pipeline run URLs, public release URLs and tag commits, package names,
sizes/hashes, anonymous download URLs, the manifest hash, the observed
`preview.json` commit and hash, the updater public-key ID and the Windows
OS-trust identity.

Repeat these cases without changing the tested package bytes:

- offline, feed unavailable and target unavailable;
- corrupt/truncated payload and invalid updater signature;
- cancellation during check/download;
- insufficient space, locked installation and read-only installation;
- interrupted handoff and subsequent truthful restart confirmation;
- reinstall of retained signed packages;
- managed-package/manual fallback.

Every case must record `falseSuccessObserved: false` and
`forcedDowngradeObserved: false`. A failure, timeout or unavailable result is not
a pass merely because user data survived. macOS is not exercised, advertised
or published here; task 065-10 owns its signing, notarization, replacement
safety and real target reports.

## Evidence registry and promotion gate

[`update-target-qualifications.json`](update-target-qualifications.json) uses
schema version 4 and stays deny-by-default. Do not add placeholder, mocked,
compile-only or manually inferred evidence. A qualified target has exactly one
record (`schemaVersion: 2`) binding:

- its target, OS/architecture and exact installation mode;
- the A-to-B transition, both independently observed running versions, and the
  public `preview.json` state that served B;
- both builds' pipeline run URLs, source SHAs, signed-matrix and manifest
  hashes, public release URLs, public tag commits, anonymous asset URLs with
  hashes, updater-key verification, OS trust and notarization;
- one updater public-key ID shared by both builds;
- all preservation and failure-case results above;
- the immutable qualification report URL and hash;
- `replacementSafety: not_applicable` for the enabled non-macOS targets.

Production approval is separate and precedes the first stable release. It
requires structured working-name clearance plus publisher evidence observed on
real preview publications: a completed preview publication, an interrupted
retry that reconciled without change, immutable assets, anonymous downloads and
the advanced feed. It names the updater public-key ID it covers; every
qualified target must prove that same identity. The publisher rejects the
retired schema-3 records, duplicate or cross-target claims, incomplete failure
matrices, any Darwin row in the signed matrix and any evidence attached to a
planned-disabled target.

Keep an enabled target `qualification_required` whenever its evidence is absent
or ambiguous. Keep both Darwin targets `planned_disabled` with empty evidence
and follow-up task 065-10. Keep `productionPromotion.enabled` false until both
enabled targets and the external approval are real. Run `pnpm run check` and then
`pnpm run check:publication` on the exact reviewed `main` commit before any
authorized publication.

## Current state

No public preview pair has completed the procedure above. Windows and Linux
remain `qualification_required`; both Darwin targets are deliberately
`planned_disabled`; production promotion remains disabled. Earlier internal
test builds (`0.2.0-preview.2` through `0.2.0-preview.5`) used a now-retired
validation key and controlled feed; their tags remain in the source repository
as history, but they are not qualification evidence and nothing in the
release contract refers to them. This document must not be read as a
qualification result.
