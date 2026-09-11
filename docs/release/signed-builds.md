# Private signed-build operations

This runbook implements the private build boundary from
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It prepares candidate artifacts and private evidence only. It does not create a
GitHub Release, upload to `gitodile-feedback`, or write `stable.json` or
`preview.json`; those remain task 065-9-6. Real A-to-B installation
qualification and automatic-target enablement remain task 065-9-7.

## Trust boundary

The pipeline is two workflows with different authority:

1. `private-candidate-build.yml` runs only for a pushed `v*` tag. Its first job
   rejects anything except `vX.Y.Z` or `vX.Y.Z-preview.N`, verifies the exact
   tag object and checked-out SHA, proves that SHA is in `origin/main`, and
   reads npm, Cargo, Cargo lock and Tauri versions. Only after those checks does
   a four-target matrix compile. It receives reviewed updater **public**
   identity variables, but no signing or publishing secret.
2. `private-candidate-signing.yml` is a `workflow_run` workflow loaded from the
   default branch. It accepts only a successful same-repository tag-push run,
   fetches the tag without checking out candidate source, re-reads metadata
   from the exact Git object, rehashes all four staged packages, and then enters
   protected signing environments. Candidate build scripts and package hooks
   therefore never receive production secrets.

All actions used by these workflows are pinned to exact commits. Both
workflows have read-only repository permissions. There is no destination token
and no publication step. Environment protection must require a maintainer
reviewer and disallow administrator bypass; approve only after comparing the
tag, SHA, version, matrix and run link. A rejected or absent environment leaves
the run blocked, not partially authorized.

The final matrix gate requires all four target evidence records to have the
same tag, source SHA, version, channel and signing profile. It rehashes every
file and requires updater verification plus the target-specific OS result.
No per-target job can produce the matrix authorization record. A failed,
cancelled or incomplete matrix cannot be consumed as promotion evidence.

## Signing layers

These are independent claims and are recorded independently:

| Layer | Targets | Required proof |
| --- | --- | --- |
| Updater signature | all four | Tauri signer covers the final update bytes; the repository-owned verifier checks the emitted signature with the configured public key and records its public key ID |
| Operating-system trust | Windows and macOS | Authenticode validation plus certificate subject/SHA-256 thumbprint on Windows; strict `codesign` validation plus authority/team identity on macOS |
| Apple notarization | both macOS targets | `notarytool` returns `Accepted`, the ticket is stapled, and `stapler validate` succeeds for the app and DMG |
| Linux OS signing | Linux AppImage | `not_applicable`; this is not represented as an OS-trust success. The updater signature is still mandatory |

The order is OS-sign/notarize first and updater-sign last. The updater
signature therefore covers the bytes a client actually downloads. A `.sig`
beside an unsigned or subsequently modified package is invalid evidence.

## Required repository configuration

Configure values without copying their contents into issues, task files,
workflow inputs or logs:

| Scope | Names | Current readiness (2026-09-10) |
| --- | --- | --- |
| Repository variables | `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY`, `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY_ID`, `GITODILE_VALIDATION_UPDATER_PUBLIC_KEY`, `GITODILE_VALIDATION_UPDATER_PUBLIC_KEY_ID`, `GITODILE_VALIDATION_UPDATE_FEED` | Not configured as of the read-only 2026-09-11 audit |
| `production-windows-signing` environment secrets | `GITODILE_WINDOWS_CERTIFICATE_BASE64`, `GITODILE_WINDOWS_CERTIFICATE_PASSWORD` | Certificate/service and access not evidenced |
| `production-macos-signing` environment secrets | `GITODILE_MACOS_CERTIFICATE_BASE64`, `GITODILE_MACOS_CERTIFICATE_PASSWORD`, `GITODILE_APPLE_SIGNING_IDENTITY`, `GITODILE_APPLE_ID`, `GITODILE_APPLE_PASSWORD`, `GITODILE_APPLE_TEAM_ID` | Apple membership, certificate and notary access not evidenced |
| `production-updater-signing` environment secrets | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Production key and backup not evidenced |
| `validation-updater-signing` environment secrets | same two updater secret names, containing a distinct validation key | Validation key and backup not evidenced |

The credential guard reports missing **names** only. Scripts do not print
values. Private key/certificate files exist only in an OS temporary directory,
are removed on exit, and are never uploaded. Evidence contains only public
key IDs, certificate subject/team data, SHA-256 certificate thumbprints,
artifact hashes and verification results. GitHub log retention and access must
be restricted to release maintainers.

The macOS jobs currently depend on a working `macos-15` runner with both target
toolchains; Windows depends on `windows-2025`; Linux depends on `ubuntu-24.04`
and its AppImage packages. Availability in a YAML matrix is not platform
validation. If a runner image, certificate, timestamp/notary service or
credential is missing, the corresponding job must fail or remain awaiting
approval. Do not substitute an unsigned artifact.

## Preparing a candidate

1. Merge the reviewed version preparation into `main` and run the complete
   repository gate there. Confirm npm, Cargo, Cargo lock and Tauri contain the
   exact same version.
2. Create `v<version>` at that exact merged commit and verify locally that the
   tag resolves to the intended SHA. Push that tag only. A branch push, pull
   request or ordinary merge cannot start this workflow.
3. Review the unprivileged validation job before approving any protected
   environment. Compare its tag and full SHA with `main`; confirm the derived
   channel (`preview` only for `-preview.N`) and all four unsigned evidence
   hashes.
4. Approve each signing environment only if its public identity matches the
   recorded certificate/key inventory. A signing job rehashes its input before
   using credentials.
5. Download the single `private-signed-v<version>` Actions artifact. Verify its
   `matrix.json` says `publicPromotionAllowed: false`; verify each target's
   `evidence.json` and hashes with `release-evidence.mjs verify-matrix`.
6. Store the private evidence with the restricted release record. Do not copy
   private source, workflow checkout archives, credentials, key material,
   notary passwords or raw authenticated responses into the retained artifact.

The protected qualification pair is fixed by the executable contract:
`0.2.0-preview.2` (A) and `0.2.0-preview.3` (B). Their candidate identities use
the `validation` signing profile and the separate validation updater key. They
still require valid tags on `main` and the complete matrix. The workflows never
alter either public feed, so producing A and B cannot advertise or promote
them. The controlled feed/bundle procedure is defined in
[updater qualification](updater-qualification.md); it does not deploy bytes,
promote a feed or substitute for real installed A-to-B results.

## Independent verification

For every retained target, verify rather than infer:

- recompute SHA-256 for each package and updater signature and compare it with
  `evidence.json`;
- verify the Tauri signature using the configured public key, then compare the
  recorded public key ID with the release inventory;
- on Windows, run Authenticode verification and compare certificate subject
  and SHA-256 thumbprint;
- on macOS, run strict code-signature verification, Gatekeeper assessment,
  and stapler validation; retain the accepted notarization result and public
  Developer ID/team identity;
- confirm tag, full private source SHA, Rust target and package role in the
  evidence; do not treat a compile-only artifact as signed or qualified.

The private artifact is candidate evidence, not a public release and not proof
that installation works. Do not enable `GITODILE_QUALIFIED_UPDATE_TARGETS`
until task 065-9-7 supplies real consecutive installed-build evidence for that
exact target and mode.

## Backup, rotation and loss

Generate updater keys only on a controlled maintainer machine. Immediately
place the encrypted private key and password recovery material in two separate
encrypted stores under distinct administrative control; keep one offline and
geographically separate. Record creation date, public key ID, custodians,
restore-test date and which signing environment uses it. Never back up a key in
the repository, an Actions artifact, release notes, chat, or ordinary cloud
drive. At least twice a year, restore into an isolated machine, sign a harmless
fixture, verify it with the recorded public key, and destroy the restored copy.

For planned rotation, generate and back up the new key first. Build and qualify
a bridge version signed by the old key whose application trusts the new public
key. Release that bridge through the normal immutable pipeline and allow the
installed population to move before signing later versions only with the new
key. Retain old public identity and bridge evidence; revoke signing access only
after the bridge window and recovery review.

If the old updater key is lost before a bridge ships, stop the pipeline and
public promotion. Do not disable verification or put a replacement signature
under an existing version. Existing clients generally need a manually
downloaded, OS-trusted reinstall that embeds the new public key. If a private
key or OS certificate may be compromised, freeze environments, revoke the
credential/certificate with its issuer, preserve audit evidence, rotate all
affected credentials, assess every artifact signed since the last known-good
event, and issue a new higher-version repair only after review. A feed rollback
does not recall downloaded bytes or undo an installation.

Before a destructive app-data migration in any future release, make a separate
versioned backup and prove forward/backward settings behavior. The build
pipeline itself never reads or changes user repositories or application data.
