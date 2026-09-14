# Signed updater qualification

This runbook executes task 065-9-7 without weakening the production release
boundary in [ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It is an evidence procedure, not permission to create tags, use credentials, or
publish a release.

## Fixed validation route

The active qualification pair is `0.2.0-preview.4` (A) to
`0.2.0-preview.5` (B). Both versions use the `validation` signing profile and a
validation updater key distinct from production. A validation build embeds
three reviewed compile-time values:

- `GITODILE_UPDATE_PROFILE=validation`;
- `GITODILE_VALIDATION_UPDATE_FEED`, exactly
  `https://<controlled-origin>/gitodile-validation/065-9-7/updates/preview.json`;
- `GITODILE_VALIDATION_UPDATE_TARGET`, equal to that package's target.

Rust rejects this routing in every other version, rejects credentials, query
strings, fragments, non-HTTPS feeds and unknown targets, and accepts validation
artifact URLs only from the feed's exact origin with `v<version>` in the path.
A production build rejects either validation value and continues to use only
the two fixed public feeds plus `GITODILE_QUALIFIED_UPDATE_TARGETS`.

After both protected signing runs succeed, dispatch
`Controlled updater qualification bundle` with their numeric run IDs. The
workflow verifies both complete enabled signed matrices and creates one
access-controlled Actions
artifact. It cannot deploy or promote anything and records
`publicPromotionAllowed: false`. Deploy the artifact contents without changing
bytes under the configured controlled origin. The first install packages for A
and B are in `packages/v<version>/`; the B updater feed and payload are under
`updates/` and `releases/v0.2.0-preview.5/`. Recompute every recorded SHA-256
after deployment before testing.

The original `.2` to `.3` pair is retained as immutable failed evidence. Its
installed Windows `.2` build aborted while constructing the HTTPS preflight
client because rustls had no crypto provider. Never overwrite, move or reuse
those tags or packages. The `.4` to `.5` pair contains the correction and is a
fresh qualification attempt; the later production-key pair is `.6` to `.7`.

The controlled host must be access-limited operationally but anonymously
readable by the test machines: the application sends no client secret or stable
identifier. Do not place a credential in the URL. Remove the validation bundle
after evidence retention is complete. A validation draft in the public feedback
repository checks publisher behavior, but is not an updater feed and does not
qualify a target.

## Per-target execution

Use the normal first-install artifact and advertised installation mode on each
enabled real target: Windows x86-64 per-user NSIS and Linux x86-64 AppImage.
Record the OS version, architecture, install path class and whether hardware or
a VM was used. Before requesting B, create identifiable settings,
open project sessions, a volatile save-version draft, dirty tracked and
untracked files in the active project and another project, and a representative
active operation/helper. Capture repository HEAD/index/worktree identities.

Complete the in-app check, download, verification, second confirmation,
handoff and restart. Independently confirm that the running version changed
from A to B. Recheck every sentinel and prove Git history is unchanged. Retain
the two matrix hashes, source tags/full SHAs, workflow URLs, package names,
sizes/hashes, updater public key ID and Windows OS-trust identity.

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
schema version 3 and stays deny-by-default. Do not add placeholder, mocked,
compile-only or manually inferred evidence. A qualified target has exactly one
record binding:

- its target, OS/architecture and exact installation mode;
- the fixed A-to-B transition and independently observed running versions;
- both signed build/run identities, matrix and artifact hashes, updater-key
  verification, OS trust and notarization;
- one validation updater public-key ID shared by both targets and both builds,
  distinct from the production updater identity;
- all preservation and failure-case results above;
- the immutable qualification report hash and Actions run URL;
- `replacementSafety: not_applicable` for the enabled non-macOS targets.

Production approval is separate and precedes the first public preview. It
requires structured working-name clearance plus a real validation-draft report
proving full-enabled-matrix failure, interrupted retry, immutable assets and an
unchanged production feed. It must not require anonymous production downloads
or the `.6` to `.7` update before those releases exist. After publication,
`publicPreviewQualification` records both public releases, their shared and
distinct production updater public-key ID, anonymous asset
hashes, the final `preview.json` commit/hash and installed `.6` to `.7` reports
for Windows and Linux. The publisher rejects old shallow schemas,
duplicate/cross-target claims, incomplete failure matrices, any Darwin row in
the signed matrix and any evidence attached to a planned-disabled target.

Keep an enabled target `qualification_required` whenever its evidence is absent
or ambiguous. Keep both Darwin targets `planned_disabled` with empty evidence
and follow-up task 065-10. Keep `productionPromotion.enabled` false until both
enabled targets and the external approval are real. Run `pnpm run check` and then
`pnpm run check:publication` on the exact reviewed `main` commit before any
authorized publication.

## Readiness snapshot — 2026-09-12

The five required reviewer-protected environments exist in
`martinezelx/gitodile-desktop`, with protected-branch admission and no
administrator bypass. Distinct validation and production Tauri updater keys are
configured and both local encrypted recovery copies passed an actual
restore/sign/verify test. The controlled GitHub Pages validation origin is
configured and intentionally empty until the real pair exists. The independent
offline production backup, publicly trusted Windows Authenticode provider and
destination-scoped publisher credential moved to task 065-9-9 and do not block
the fixed internal validation pair. No release exists in the public
`martinezelx/gitodile` repository, so no A/B matrix or
installed-platform evidence exists. Windows and Linux remain
`qualification_required`; both Darwin targets are deliberately
`planned_disabled`; production promotion remains disabled. This document must
not be read as a qualification result.
