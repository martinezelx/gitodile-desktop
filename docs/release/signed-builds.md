# Protected signed-build operations

This runbook implements the protected build boundary from
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It prepares candidate artifacts and access-controlled evidence only. It does not create a
GitHub Release, upload to `gitodile`, or write `stable.json` or
`preview.json`; those remain task 065-9-6. Real A-to-B installation
qualification and automatic-target enablement remain tasks 065-9-7 and 065-9-8.

## Trust boundary

Release preparation and the release itself are split across two workflows with
different authority; the second is one linear run per immutable release
identity:

1. `merge-driven-release.yml` is loaded from the protected default branch and
   reacts only to a merged pull request from the same repository. Its
   unprivileged job proves the head branch is exactly `release/<version>`, the
   merge SHA is the exact current `main` tip, every required check succeeded,
   the release diff is narrowly allowlisted, and all version metadata and
   reviewed notes agree. Only its environment-protected job receives the
   dedicated deploy key used to create the lightweight `v<version>` tag at that
   exact merge SHA. It then idempotently dispatches `release-pipeline.yml`
   with the authorization run ID, tag and SHA.
2. `release-pipeline.yml` accepts only that coordinator dispatch and only from
   protected `main`. Its `validate` job verifies the authorization artifact and
   coordinator run, the exact tag object and SHA, proves that SHA is in
   `origin/main`, and re-reads npm, Cargo, Cargo lock and Tauri versions. Every
   later stage is a job of the same run, ordered by `needs`, and consumes only
   artifacts uploaded earlier in that run:
   - `build` compiles the enabled two-target matrix (Windows x86-64 NSIS and
     Linux x86-64 AppImage) from the tagged SHA. It receives reviewed updater
     **public** identity variables, references no secret and enters no
     environment, so GitHub passes it none; package hooks and third-party
     build code therefore never see signing or publishing credentials.
   - `matrix-gate`, `windows-deferred-boundary` and `linux-os-boundary` rehash
     the staged packages and record the OS-trust boundary for each target.
   - `updater-sign` is the only job that enters an updater-signing
     environment. It rehashes every OS-stage package, signs the final bytes,
     verifies each signature with the repository-owned verifier and closes the
     private matrix record.
   - `stage` and `publish` are described in
     [public release publishing](public-publishing.md); only `publish` enters a
     destination environment.

   Validation, signing and publication scripts run from the pipeline
   definition revision (`github.workflow_sha`, protected `main` at dispatch
   time); only `build` checks out the tagged application source.

Source visibility is not an authority boundary. A public clone can read the
workflows and scripts but cannot read environment secrets, approve a protected
environment, create a protected release tag, or use the destination-scoped
publisher credential.

All actions used by these workflows are pinned to exact commits. Every
pipeline job has read-only source-repository permissions. The coordinator has
only the Actions read/write access needed to inspect checks and dispatch the
pipeline; protected-tag creation uses a repository-specific deploy key only
inside `release-tagging`. The destination token is visible only to the
`publish` job through its environment. `public-release-stable` requires a
reviewer and must disallow administrator bypass; approve only after comparing
the tag, SHA, version, matrix and run link. A rejected or absent environment
leaves the run blocked, not partially authorized.

The final matrix gate requires both enabled target evidence records to have the
same tag, source SHA, version, channel, signing profile and updater public-key
identity. It rehashes every
file and requires updater verification plus the target-specific OS result.
No per-target job can produce the matrix authorization record. A failed,
cancelled or incomplete matrix cannot be consumed as promotion evidence.

## Signing layers

These are independent claims and are recorded independently:

| Layer | Targets | Required proof |
| --- | --- | --- |
| Updater signature | Windows and Linux | Tauri signer covers the final update bytes; the repository-owned verifier checks the emitted signature with the configured public key and records its public key ID |
| Operating-system trust | Windows | Pre-1.0 and initial 1.0 record `not_checked` / `authenticode_deferred` / null identity; post-1.0 task 065-9-9 must add Authenticode validation before claiming OS trust |
| Linux OS signing | Linux AppImage | `not_applicable`; this is not represented as an OS-trust success. The updater signature is still mandatory |

Pre-1.0 and initial `1.0.0` Windows packages carry the unchanged unsigned NSIS
bytes through a boundary record whose result is `not_checked`, reason is
`authenticode_deferred` and public identity is null, then apply and verify the
appropriate Tauri signature. Publication may accept that state only with the
required unknown-publisher warning. Task 065-9-9 owns post-1.0 Authenticode.

macOS signing and notarization are deliberately absent from this phase. Task
065-10 must add them back together with real installed qualification; no Apple
secret or macOS package belongs in the current release workflow.

The order is OS-sign/notarize first and updater-sign last. The updater
signature therefore covers the bytes a client actually downloads. A `.sig`
beside an unsigned or subsequently modified package is invalid evidence.

## Required repository configuration

Configure values without copying their contents into issues, task files,
workflow inputs or logs:

| Scope | Names | Current readiness (2026-09-12) |
| --- | --- | --- |
| Repository variables | `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY`, `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY_ID`; after real A-to-B qualification only, canonical `GITODILE_QUALIFIED_UPDATE_TARGETS=windows-x86_64,linux-x86_64` | The one reviewed public identity is configured. Empty qualified targets remain valid for `preview-testing`; the pipeline supplies the separate canonical `GITODILE_PREVIEW_TEST_UPDATE_TARGETS` pair only to preview builds so real preview updates can be tested without claiming qualification. |
| `production-windows-signing` environment secrets and variable | Reserved post-1.0 names: secrets `GITODILE_WINDOWS_CERTIFICATE_BASE64`, `GITODILE_WINDOWS_CERTIFICATE_PASSWORD`; reviewed variable `GITODILE_WINDOWS_CERTIFICATE_SHA256` | Deliberately unconfigured until task 065-9-9 resumes after `1.0.0` |
| `production-updater-signing` environment secrets | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key configured; local encrypted restore/sign/verify passed; independent offline backup remains pending before the first stable release |

There is exactly one updater signing identity. The earlier disposable
validation key, its `validation-updater-signing` environment, the
`GITODILE_VALIDATION_*` variables and the controlled validation feed are
retired: no build, workflow or contract refers to them, and the GitHub
environment and variables should be deleted.

The credential guard reports missing **names** only. Scripts do not print
values. Private key/certificate files exist only in an OS temporary directory,
are removed on exit, and are never uploaded. Evidence contains only public
key IDs, certificate subject/team data, SHA-256 certificate thumbprints,
artifact hashes and verification results. GitHub log retention and access must
be restricted to release maintainers.

Windows depends on `windows-2025`; Linux depends on `ubuntu-24.04`
and its AppImage packages. Availability in a YAML matrix is not platform
validation. If a runner image or updater credential is missing, the
corresponding job must fail or remain awaiting approval. Windows
Authenticode is deliberately deferred through `1.0.0`. Windows evidence must
therefore record `not_checked` with reason `authenticode_deferred`; public
delivery must show the unknown-publisher warning. A certificate becomes a gate only when post-1.0 task 065-9-9 enables
that signing layer.

## Preparing a candidate

1. From a clean, up-to-date `main`, run
   `pnpm run release:prepare <version>`. The command creates only
   `release/<version>`, updates npm, Cargo, Cargo lock, Tauri and README version
   metadata, and creates the required notes file. Review and replace every
   notes placeholder, run the complete repository gate, commit, push the one
   release branch and open a same-repository pull request to `main`.
2. Require the complete named check set to succeed, review the allowlisted
   release-only diff and merge the pull request. Direct pushes, fork pull
   requests, manual tags and other branch names do not enter this release path.
   The default-branch coordinator revalidates the merge and creates
   `v<version>` idempotently at the exact merge SHA before dispatching the
   release pipeline. A pre-existing tag at any other SHA fails closed.
3. Where an environment requires a reviewer, review the unprivileged jobs
   before approving it. Compare the run's tag and full SHA with `main`;
   confirm the derived channel (`preview` only for `-preview.N`) and both
   unsigned evidence hashes. A signing job rehashes its input before using
   credentials.
4. After the run, the single `private-signed-v<version>` Actions artifact
   remains available for 90 days. Its `matrix.json` says
   `publicPromotionAllowed: false`; each target's `evidence.json` and hashes
   verify with `release-evidence.mjs verify-matrix`.
5. Store the protected evidence with the restricted release record. Do not copy
   source archives, workflow checkout archives, credentials, key material,
   notary passwords or raw authenticated responses into the retained artifact.

Qualification uses these same builds: the installed A-to-B evidence described
in [updater qualification](updater-qualification.md) comes from two real
consecutive public previews, never from a separately keyed or separately fed
build.

## Independent verification

For every retained target, verify rather than infer:

- recompute SHA-256 for each package and updater signature and compare it with
  `evidence.json`;
- verify the Tauri signature using the configured public key, then compare the
  recorded public key ID with the release inventory;
- on Windows, run Authenticode verification and compare certificate subject,
  issuer and SHA-256 thumbprint; require a timestamp, Code Signing EKU and a
  trusted non-self-signed chain. A self-signed certificate never qualifies;
- confirm tag, full source SHA, Rust target and package role in the
  evidence; do not treat a compile-only artifact as signed or qualified.

The protected artifact is candidate evidence, not a public release and not proof
that installation works. Do not enable `GITODILE_QUALIFIED_UPDATE_TARGETS`
until tasks 065-9-7/065-9-8 supply real consecutive installed-build evidence
for that exact target and mode.

## Backup, rotation and loss

Generate updater keys only on a controlled maintainer machine. Immediately
place the encrypted private key and password recovery material in two separate
encrypted stores under distinct administrative control; keep one offline and
geographically separate. Record creation date, public key ID, custodians,
restore-test date and which signing environment uses it. Never back up a key in
the repository, an Actions artifact, release notes, chat, or ordinary cloud
drive. At least twice a year, restore into an isolated machine, sign a harmless
fixture, verify it with the recorded public key, and destroy the restored copy.

### Readiness record — 2026-09-12

The production Tauri updater identity is configured in its protected GitHub
environment. An encrypted CurrentUser-DPAPI recovery copy exists on the
controlled Windows maintainer machine with user-only filesystem access. It was
restored, used to sign a new harmless fixture and verified with the
application's Rust verifier and its recorded public key. The key identity is
`sha256-074b4317dbc734a346c9efcdcb0b1e075febcb6b711c8fe7adfbab732f0d2ff1`.

This is not the required second offline, geographically separate recovery
store. No stable release may run until that independent backup is made and its
custody is recorded. The private key and password are deliberately absent from
this repository and its evidence. The disposable validation identity used by
the retired internal test builds is no longer referenced anywhere; delete its
environment and destroy its recovery copy once those builds are no longer
needed for any inspection.

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
