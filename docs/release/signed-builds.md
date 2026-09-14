# Protected signed-build operations

This runbook implements the protected build boundary from
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It prepares candidate artifacts and access-controlled evidence only. It does not create a
GitHub Release, upload to `gitodile`, or write `stable.json` or
`preview.json`; those remain task 065-9-6. Real A-to-B installation
qualification and automatic-target enablement remain tasks 065-9-7 and 065-9-8.

## Trust boundary

Release preparation and protected signing are split across three workflows with
different authority:

1. `merge-driven-release.yml` is loaded from the protected default branch and
   reacts only to a merged pull request from the same repository. Its
   unprivileged job proves the head branch is exactly `release/<version>`, the
   merge SHA is the exact current `main` tip, every required check succeeded,
   the release diff is narrowly allowlisted, and all version metadata and
   reviewed notes agree. Only its environment-protected job receives the
   dedicated deploy key used to create the lightweight `v<version>` tag at that
   exact merge SHA. It then idempotently dispatches the candidate workflow.
2. `private-candidate-build.yml` accepts only that coordinator dispatch. Its
   first job verifies the authorization artifact and coordinator run, the exact
   tag object and checked-out SHA, proves that SHA is in `origin/main`, and
   re-reads npm, Cargo, Cargo lock and Tauri versions. Only after those checks
   does the enabled two-target matrix (Windows x86-64 NSIS and Linux x86-64
   AppImage) compile. It receives reviewed updater **public** identity
   variables, but no signing or publishing secret.
3. `private-candidate-signing.yml` is a `workflow_run` workflow loaded from the
   default branch. It accepts only a successful same-repository coordinator-
   dispatched candidate run,
   fetches the tag without checking out candidate source, re-reads metadata
   from the exact Git object, rehashes both staged packages, and then enters
   protected signing environments. Candidate build scripts and package hooks
   therefore never receive production secrets. The workflow runtime is pinned
   to its immutable workflow SHA, not a later moving `main`.

Source visibility is not an authority boundary. A public clone can read the
workflows and scripts but cannot read environment secrets, approve a protected
environment, create a protected release tag, or use the destination-scoped
publisher credential.

All actions used by these workflows are pinned to exact commits. Candidate and
signing jobs have read-only source-repository permissions. The coordinator has
only the Actions read/write access needed to inspect checks and dispatch the
candidate; protected-tag creation uses a repository-specific deploy key only
inside `release-tagging`. There is no destination token and no publication
step in these workflows. Environment protection must require a maintainer
reviewer and disallow administrator bypass; approve only after comparing the
tag, SHA, version, matrix and run link. A rejected or absent environment leaves
the run blocked, not partially authorized.

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
| Repository variables | `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY`, `GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY_ID`, `GITODILE_VALIDATION_UPDATER_PUBLIC_KEY`, `GITODILE_VALIDATION_UPDATER_PUBLIC_KEY_ID`, `GITODILE_VALIDATION_UPDATE_FEED`; after real A-to-B qualification only, canonical `GITODILE_QUALIFIED_UPDATE_TARGETS=windows-x86_64,linux-x86_64` | Both distinct public identities and the controlled HTTPS validation feed are configured. Empty qualified targets are valid for `preview-testing` and keep automatic installation disabled; only real qualification may set the canonical Windows/Linux value. |
| `production-windows-signing` environment secrets and variable | Reserved post-1.0 names: secrets `GITODILE_WINDOWS_CERTIFICATE_BASE64`, `GITODILE_WINDOWS_CERTIFICATE_PASSWORD`; reviewed variable `GITODILE_WINDOWS_CERTIFICATE_SHA256` | Deliberately unconfigured until task 065-9-9 resumes after `1.0.0` |
| `production-updater-signing` environment secrets | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Distinct key configured; local encrypted restore/sign/verify passed; independent offline backup remains pending before public production use |
| `validation-updater-signing` environment secrets | same two updater secret names, containing a distinct validation key | Distinct disposable validation key configured; local encrypted restore/sign/verify passed |

The credential guard reports missing **names** only. Scripts do not print
values. Private key/certificate files exist only in an OS temporary directory,
are removed on exit, and are never uploaded. Evidence contains only public
key IDs, certificate subject/team data, SHA-256 certificate thumbprints,
artifact hashes and verification results. GitHub log retention and access must
be restricted to release maintainers.

Windows depends on `windows-2025`; Linux depends on `ubuntu-24.04`
and its AppImage packages. Availability in a YAML matrix is not platform
validation. If a runner image or updater credential is missing, the
corresponding validation job must fail or remain awaiting approval. Windows
Authenticode is deliberately deferred through `1.0.0`. Both validation and
production Windows evidence must therefore record `not_checked` with reason
`authenticode_deferred`; public delivery must show the unknown-publisher
warning. A certificate becomes a gate only when post-1.0 task 065-9-9 enables
that signing layer.

## Preparing a candidate

1. From a clean, up-to-date `main`, run
   `pnpm run release:prepare -- <version>`. The command creates only
   `release/<version>`, updates npm, Cargo, Cargo lock, Tauri and README version
   metadata, and creates the required notes file. Review and replace every
   notes placeholder, run the complete repository gate, commit, push the one
   release branch and open a same-repository pull request to `main`.
2. Require the complete named check set to succeed, review the allowlisted
   release-only diff and merge the pull request. Direct pushes, fork pull
   requests, manual tags and other branch names do not enter this release path.
   The default-branch coordinator revalidates the merge and creates
   `v<version>` idempotently at the exact merge SHA before dispatching the
   candidate build. A pre-existing tag at any other SHA fails closed.
3. Review the unprivileged validation jobs before approving any protected
   environment. Compare its tag and full SHA with `main`; confirm the derived
   channel (`preview` only for `-preview.N`) and both unsigned evidence
   hashes.
4. Approve each signing environment only if its public identity matches the
   recorded certificate/key inventory. A signing job rehashes its input before
   using credentials.
5. Download the single `private-signed-v<version>` Actions artifact. Verify its
   `matrix.json` says `publicPromotionAllowed: false`; verify each target's
   `evidence.json` and hashes with `release-evidence.mjs verify-matrix`.
6. Store the protected evidence with the restricted release record. Do not copy
   source archives, workflow checkout archives, credentials, key material,
   notary passwords or raw authenticated responses into the retained artifact.

The active protected qualification pair is fixed by the executable contract:
`0.2.0-preview.4` (A) and `0.2.0-preview.5` (B). Their candidate identities use
the `validation` signing profile and one consistent validation updater key.
Both workflows fail if the configured validation public key or its ID equals
the production identity. They
still require valid tags on `main` and the complete matrix. The workflows never
alter either public feed, so producing A and B cannot advertise or promote
them. The controlled feed/bundle procedure is defined in
[updater qualification](updater-qualification.md); it does not deploy bytes,
promote a feed or substitute for real installed A-to-B results.
The immutable `.2`/`.3` attempt remains failed evidence after its Windows build
exposed the missing rustls crypto-provider defect; it must never be reused.

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

### Readiness record — 2026-09-12

Distinct validation and production Tauri updater identities are configured in
their separate protected GitHub environments. Encrypted CurrentUser-DPAPI
recovery copies exist on the controlled Windows maintainer machine with
user-only filesystem access. Each recovery copy was restored, used to sign a
new harmless fixture and verified with the application's Rust verifier and its
recorded public key. The key identities are:

- validation:
  `sha256-2ee9c46df4787edce38ccbf947056e6af541a5ed5a37f1532857cd6e9115a8fa`;
- production:
  `sha256-074b4317dbc734a346c9efcdcb0b1e075febcb6b711c8fe7adfbab732f0d2ff1`.

This is not the required second offline, geographically separate recovery
store. No production-signed matrix or public production distribution may run
until that independent backup is made and its custody is recorded. The fixed
`.4`/`.5` qualification pair may run with the disposable validation identity:
it is isolated from production, has a tested encrypted restore, cannot promote
a production feed, and remains subject to its protected-environment approval.
The private keys and passwords are deliberately absent from this repository
and its evidence.

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
