# Public release publishing

This runbook implements the public promotion half of
[ADR 0010](../adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
It consumes the package-only output of the
[protected signed-build pipeline](signed-builds.md); it never compiles or signs an
application and never accepts a local installer path supplied to the privileged
job.

No qualified production or stable publication is currently authorized. A
narrow `preview-testing` policy may automatically publish a Tauri-signed
preview as a GitHub prerelease and advance only `preview.json`; that exception
does not change any qualification state or claim that installation succeeded.
The qualification registry
[`update-target-qualifications.json`](update-target-qualifications.json) is
deny-by-default: Windows x86-64 and Linux x86-64 remain
`qualification_required`, both macOS targets are `planned_disabled`,
working-name clearance is not evidenced, and `productionPromotion.enabled` is
false. Tasks 065-9-7 and 065-9-8 may replace the enabled-target states only
after recording the real
signed A-to-B evidence described by the
[updater qualification runbook](updater-qualification.md). Schema version 4
binds each record to its target, two real consecutive public preview releases,
the public feed that served the update, preservation/failure results and
platform trust; the retired schema-3 records and older shallow forms are
rejected.

## Promotion model

Publication is the last two jobs, `stage` and `publish`, of
`.github/workflows/release-pipeline.yml`; there is no separate publication
trigger. They run only after `updater-sign` succeeded in the same run and
consume only that run's `private-signed-<tag>` artifact. The publication mode
is derived from the signed matrix, never chosen: a preview candidate is
`preview-testing` and a stable candidate is `production`. Ordinary pushes,
pull requests, merges and tags cannot publish directly, and there is no
draft-only or test-only mode.

- automatic `preview-testing` accepts only a Tauri-signed preview,
  requires the complete Windows NSIS/Linux AppImage matrix, preserves
  `authenticode_deferred`, rejects every macOS target, finalizes the release as
  a GitHub prerelease and may advance only `preview.json`. It deliberately
  accepts `qualification_required` targets and returns an empty
  `qualifiedTargets` list; it is publication-pipeline testing, not target
  qualification or stable authorization. The publisher prepends a fixed
  bilingual notice saying exactly that to the public release body and updater
  notes, independent of the curated change summary.
- automatic `production` accepts only a production-signing profile, derives a
  deterministic UTC publication timestamp from the exact source commit, and
  requires a registry that approves production plus every
  exact enabled target in the signed matrix. A missing or malformed A/B proof blocks
  the entire release; the publisher never drops the failed row to make a
  partial manifest.

The unprivileged `stage` job records the identity of its own pipeline run
(release pipeline, `workflow_dispatch`, protected `main`, healthy), checks the
live feedback contract, rehashes the
complete enabled signed matrix, checks updater and OS-trust evidence independently,
derives the channel and GitHub prerelease flag from the version, and creates a
public-only bundle. That bundle contains packages, updater signatures,
`latest.json`, `SHA256SUMS`, `LICENSE`, `THIRD_PARTY_LICENSES.md`, curated notes
and the reviewed publisher runtime. It does not expose the source SHA as an asset,
as a public asset, evidence files, candidate archives, signing material or a
credential.

Only the `publish` job enters a destination environment and receives
`GITODILE_PUBLIC_RELEASE_TOKEN`. Use a short-lived GitHub App installation token
with Contents write access only to `martinezelx/gitodile`; a narrowly
scoped expiring fine-grained PAT is the temporary fallback. This job does not
check out the source repository, and it is serialized across every release
through the `gitodile-publication` concurrency group so an older run can never
race a newer one at the feeds. Source visibility is not an authorization
boundary. The environment is named after the channel it may write:

| Mode | Environment | Protection |
| --- | --- | --- |
| `preview-testing` | `public-release-preview` | protected branches only, intentionally no reviewer, so a merged preview completes without maintainer intervention |
| `production` | `public-release-stable` | required reviewer, no administrator bypass, plus the 065-9-7/065-9-8 evidence review and working-name clearance |

Each environment holds its own copy of `GITODILE_PUBLIC_RELEASE_TOKEN`; an
environment without the secret fails closed before any destination request.

## Immutable release sequence

1. Add reviewed notes at `docs/release/notes/v<version>.md`, and the
   bilingual in-app highlights at `docs/release/highlights/v<version>.json`,
   on the one `release/<version>` branch created by
   `pnpm run release:prepare <version>`.
   Do not generate
   them from source or feedback commits and do not include private links,
   authenticated URLs, local paths, credentials or signing details.
2. Merging the release pull request starts the coordinator, which tags and
   dispatches one `Release <tag> at <sha>` pipeline run. Its `updater-sign` job
   produces the single `private-signed-v<version>` artifact; `matrix.json`
   remains `publicPromotionAllowed: false` and the `stage` job supplies the
   separate promotion decision. All targets record the same updater public-key
   ID.
3. On the first public previews, inspect the published release, asset names,
   hashes, flags, public tag and curated notes; re-run the `publish` job once
   to prove reconciliation without change. Confirm that `stable.json` did not
   move. This is publisher evidence for the production approval, not target
   qualification.
4. Before target qualification is complete, a signed preview automatically
   enters `preview-testing`, finalizes only that prerelease and advances
   `preview.json`; record it as pipeline evidence, never as an installed-update
   pass. After 065-9-7/
   065-9-8 have recorded both enabled targets and production approval, a stable
   candidate enters reviewer-approved `production`. The fixed timestamp comes
   from the exact source commit. Do not edit the notes or qualification
   registry during a retry.
5. The `publish` job creates the public lightweight tag at a commit in the
   feedback repository and reconciles one draft release. Drafts are found by
   listing releases, because GitHub does not resolve a draft by its tag.
   Existing bytes are downloaded and hashed. While the release is still a
   draft, nobody could download it, so a missing asset is uploaded and a
   differing one is replaced: a re-dispatched pipeline rebuilds installers
   that are not byte-reproducible. Once the release is published it is
   immutable: a conflicting byte, unexpected asset or missing asset stops the
   run, and nothing is deleted, renamed or replaced.
6. Only after the full release is final does the `publish` job download every
   asset anonymously and recheck SHA-256. It then prepares complete channel
   manifests and updates the public `main` tree with one compare-and-swap Git
   commit. A concurrent move of `main` fails rather than overwriting it.
7. To retry an uncertain publication, re-run the failed jobs of the same
   pipeline run; the `publish` job is idempotent against the destination. Do
   not dispatch a second pipeline for a tag whose run succeeded; the
   coordinator refuses to, and a manual dispatch would only reconcile the same
   immutable release.

Every manifest URL names `/releases/download/v<version>/<asset>`. Preview
versions set GitHub `prerelease: true` and can advance only `preview.json`.
Stable versions are rejected by `preview-testing`. Only qualified production
sets the GitHub prerelease flag to false, advances `stable.json`, and advances preview only
when newer than its current candidate. Equal versions must have byte-identical
manifests. Older versions fail closed. A stable release is newly built and
signed; changing a preview release flag is never promotion.

The asset and manifest set is exactly Windows x86-64 NSIS plus Linux x86-64
AppImage. A Darwin target or macOS-looking asset is an error while task 065-10
is open. Preview-testing publication confirms only the immutable signed matrix,
curated notes, preview identity, destination and unknown-publisher disclosure;
it does not satisfy a registry evidence field by itself. Production approval
is the pre-stable gate: it records name clearance and the publisher behaviour
observed on real preview publications (a completed preview publication, an
interrupted retry that reconciled without change, immutable assets, anonymous
downloads and the advanced feed), and names the updater key identity it
covers. Each enabled target's installed A-to-B proof between two of those
public previews is recorded separately in its own registry entry.

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

The `publish` job updates the feedback README download block in the same
conflict-checked commit as the first feed change. The issue forms are never
written. The `stage` job runs `check-public-feedback.mjs --publication-plan`,
which checks their filenames, IDs, labels, private security channel,
repository settings and the planned README guidance against the live
destination before the privileged job. It does not repeat the repository gate
(`pnpm run check`): that gate already ran in CI on the exact merge SHA and the
coordinator required it, whereas the staging job checks out protected `main`'s
current tip. `pnpm run check:publication` remains the local pre-release
command that combines both.

## Current external blockers

- The protected environments and the production updater identity were
  configured on 2026-09-12; the retired validation identity and its
  environment are no longer referenced and should be deleted.
- The local encrypted updater-key recovery copy passed restore/sign/verify.
  The independent offline production backup and real Authenticode identity are
  deferred to task 065-9-9. Apple credentials are deliberately out of scope
  with macOS disabled under task 065-10.
- The destination environment and destination-scoped publisher credential must
  be independently verified before the first `preview-testing` publication;
  their presence is not target qualification.
- Neither enabled target has the installed A-to-B evidence between two real
  public previews required by 065-9-7/065-9-8. macOS retains its separate
  replacement-safety blocker without entering this release matrix.
- Written clearance for the working name is not evidenced.

Local fixtures, mocked trust values and workflow parsing prove the contracts,
not signing, notarization, anonymous production downloads, operating-system
trust or installed update success.
