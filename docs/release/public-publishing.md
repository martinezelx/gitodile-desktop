# Public release publishing

This runbook implements the public promotion half of
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It consumes the package-only output of the
[protected signed-build pipeline](signed-builds.md); it never compiles or signs an
application and never accepts a local installer path supplied to the privileged
job.

No production publication is currently authorized. The qualification registry
[`update-target-qualifications.json`](update-target-qualifications.json) is
deny-by-default: Windows x86-64 and Linux x86-64 remain
`qualification_required`, both macOS targets are `planned_disabled`,
working-name clearance is not evidenced, and `productionPromotion.enabled` is
false. Tasks 065-9-7 and 065-9-8 may replace the enabled-target states only
after recording the real
signed A-to-B evidence described by the
[updater qualification runbook](updater-qualification.md). Schema version 3
binds each record to its target, both signed builds, preservation/failure
results and platform trust, while separately retaining the pending public
`.4` to `.5` proof; older shallow forms are rejected.

## Promotion model

`.github/workflows/public-release-publishing.yml` is manual-only. Pushes, pull
requests, merges, tags and completion of the private workflows cannot publish.
Its input is the numeric run ID of one successful `Private candidate signing`
workflow and one closed mode:

- `validation-draft` accepts only the fixed validation-key pair
  `0.2.0-preview.2` / `0.2.0-preview.3`. It may reconcile a draft release but
  cannot finalize it or write `stable.json` / `preview.json`.
- `production` accepts only a production-signing profile, a fixed UTC
  publication timestamp and a registry that approves production plus every
  exact enabled target in the signed matrix. A missing or malformed A/B proof blocks
  the entire release; the publisher never drops the failed row to make a
  partial manifest.

The unprivileged staging job checks the live feedback contract, rehashes the
complete enabled signed matrix, checks updater and OS-trust evidence independently,
derives the channel and GitHub prerelease flag from the version, and creates a
public-only bundle. That bundle contains packages, updater signatures,
`latest.json`, `SHA256SUMS`, `LICENSE`, `THIRD_PARTY_LICENSES.md`, curated notes
and the reviewed publisher runtime. It does not expose the source SHA as an asset,
as a public asset, evidence files, candidate archives, signing material or a
credential.

Only the second job enters a destination environment and receives
`GITODILE_PUBLIC_RELEASE_TOKEN`. Use a short-lived GitHub App installation token
with Contents write access only to `martinezelx/gitodile-feedback`; a narrowly
scoped expiring fine-grained PAT is the temporary fallback. This job does not
check out the source repository. Source visibility is not an authorization
boundary. Both destination environments require
reviewers and no administrator bypass; production additionally requires the
065-9-7/065-9-8 evidence review and working-name clearance.

## Immutable release sequence

1. Add reviewed notes at `docs/release/notes/v<version>.md`. Do not generate
   them from source or feedback commits and do not include private links,
   authenticated URLs, local paths, credentials or signing details.
2. Verify the referenced signing run and its single `private-signed-v<version>`
   artifact. `matrix.json` must remain `publicPromotionAllowed: false`; the
   public publisher supplies the separate promotion decision. Verify that all
   targets record the same updater public-key ID and that validation and
   production identities are different.
3. Dispatch the public workflow in `validation-draft` first. Inspect the draft,
   asset names, hashes, flags, public tag and curated notes; interrupt and retry
   once to prove reconciliation. Draft assets require authenticated inspection
   because GitHub does not expose draft downloads anonymously. Confirm that no
   production feed moved. This is pipeline validation, not target qualification.
4. After 065-9-7/065-9-8 have recorded both enabled targets and the release approval, dispatch
   `production` with the same signing run and fixed UTC timestamp. Do not edit
   the notes, timestamp or qualification registry during a retry.
5. The coordinator creates the public lightweight tag at a commit in the
   feedback repository, reconciles one draft release, and uploads only missing
   assets. Existing bytes are downloaded and hashed. A conflicting byte,
   unexpected asset or finalized release missing an asset stops the run; no
   asset is deleted, renamed or replaced.
6. Only after the full release is final does the coordinator download every
   asset anonymously and recheck SHA-256. It then prepares complete channel
   manifests and updates the public `main` tree with one compare-and-swap Git
   commit. A concurrent move of `main` fails rather than overwriting it.

Every manifest URL names `/releases/download/v<version>/<asset>`. Preview
versions set GitHub `prerelease: true` and can advance only `preview.json`.
Stable versions set it to false, advance `stable.json`, and advance preview only
when newer than its current candidate. Equal versions must have byte-identical
manifests. Older versions fail closed. A stable release is newly built and
signed; changing a preview release flag is never promotion.

The asset and manifest set is exactly Windows x86-64 NSIS plus Linux x86-64
AppImage. A Darwin target or macOS-looking asset is an error while task 065-10
is open. Production approval is the pre-publication gate: it records the real
validation draft, interrupted retry, immutable reconciliation, unchanged feed,
the `.2` to `.3` installed qualification and name clearance. Anonymous
downloads, preview advancement and the public `.4` to `.5` installed proof are
recorded afterward in `publicPreviewQualification`; they cannot be prerequisites
for their own first publication.

## Retry and recovery

Re-run with the same inputs after an interruption. The coordinator reads the
remote release before acting: a matching draft keeps matching assets and adds
only missing ones; a finalized release is read-only and must already match
completely. If final publication succeeded but feed promotion did not, the
retry anonymously verifies the finalized assets again and attempts only the
conflict-checked feed commit. Never delete a release/tag or upload a new byte
under the same version to repair a failed run. Fix the infrastructure or issue
a higher version.

GitHub raw-content caching makes a feed update eventually visible. Do not
rewrite the commit to force cache invalidation. Check the repository contents
API for the committed byte identity, then poll the anonymous raw endpoint with
a bounded delay before declaring operational propagation; installed clients
may see the previous complete manifest during that interval.

To withdraw a bad candidate, make a reviewed commit restoring the previous
complete feed manifest. Keep the release, tag and installers. Withdrawal stops
new offers only after caches expire; it does not recall a download, uninstall a
version or promise rollback. Publish a higher-version repair when possible.
Old signed installers remain available for manual reinstall and updater-key
rotation bridges.

The coordinator updates the feedback README download block in the same
conflict-checked commit as the first feed change. The issue forms are never
written. `pnpm run check:publication` checks their filenames, IDs, labels,
private security channel and repository settings before the privileged job.

## Current external blockers

- No real complete signed matrix from 065-9-5 exists. The five required
  reviewer-protected environments were configured on 2026-09-12, but a
  read-only audit found no repository or environment secrets and variables.
- Production and validation updater keys/backups, a real Authenticode identity
  and protected environments are not evidenced. Apple credentials are
  deliberately out of scope with macOS disabled under task 065-10.
- The destination environment exists, but no destination-scoped publisher
  credential is configured or evidenced, and the public feedback repository
  has no releases.
- The public feedback README has not been changed because this work performs no
  commit or push; the coordinator holds the reviewed idempotent update for the
  first authorized promotion.
- Neither enabled target has the two real installed packages and failure
  evidence required by 065-9-7/065-9-8. macOS retains its separate
  replacement-safety blocker without entering this release matrix.
- Written clearance for the working name is not evidenced.

Local fixtures, mocked trust values and workflow parsing prove the contracts,
not signing, notarization, anonymous production downloads, operating-system
trust or installed update success.
