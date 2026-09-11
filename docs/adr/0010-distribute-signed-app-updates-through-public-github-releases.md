# ADR 0010: Distribute signed app updates through public GitHub Releases

- Status: accepted
- Date: 2026-09-03

Implementation contracts fixed on 2026-09-09 are recorded in the
[application update contracts](../architecture/app-update-contracts.md) and
their executable fixture. They refine this decision without changing its two
channels, hosting, signing, or publication architecture.

## Context

GitOdile needs to update its installed desktop application without interrupting
Git operations, losing UI drafts, exposing private source, or requiring users
to authenticate. This is separate from getting a project's remote changes and
from the existing system-Git update command.

Inspection on 2026-09-03 found:

- `martinezelx/project-gitodile` is private; `martinezelx/gitodile-feedback` is
  public and has no releases yet. Task 108 established the public issue forms.
- Tauri is on v2. The updater is not installed, there is no updater key or
  endpoint in the app configuration, and CI does not publish installers.
- At the start of planning the installed version was `0.1.0`; its separate alpha label was renamed to
  preview when the user settled the two-channel policy below. The local
  Changelog deliberately opens without a network request.
- [Task 065-8](../../work/active/release-1.0/065-8-release-hardening.md)
  previously owned the unspecified update strategy. There was no updater ADR.
- [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md) still requires
  real packaged-platform evidence. [ADR 0001](0001-adopt-a-progressive-hybrid-git-backend.md)
  plans to update bundled Git with the app; that bundling is not implemented
  by this decision.
- Native repository locks are scoped by common Git directory. Frontend session
  busy state does not establish a process-wide, race-free installation gate;
  clone, initialization, background work, and other projects also matter.

The user accepted this direction on 2026-09-03, with exactly two channels and
short-lived version branches merged into `main`. This records the agreed
design, not a claim that update infrastructure exists. Implementation belongs to
[epic 065-9](../../work/active/release-1.0/065-9-signed-application-updates.md).

## Decision

### Hosting and channels

Use the official Tauri 2 updater from Rust and publish its signed artifacts as
GitHub Release assets in `martinezelx/gitodile-feedback`. Keep source, builds,
signing configuration, and private build evidence in `project-gitodile`.
Installers are release assets, never binary commits or Git LFS objects.

The public repository can serve both feedback and downloads. Public release
tags refer to commits in that repository; they cannot refer to private source
commits. Record the source tag/SHA and build run in private release evidence,
and expose only intentionally public provenance. GitHub's automatic source
archives will contain the public feedback repository, not the application.
Write curated product release notes: generating them from feedback commits
would describe changes to issue forms rather than GitOdile.

Use two small static Tauri manifests in the public repository:

| Feed | Planned HTTPS endpoint | Selection |
| --- | --- | --- |
| Stable | `https://raw.githubusercontent.com/martinezelx/gitodile-feedback/main/updates/stable.json` | Full releases only |
| Preview | `https://raw.githubusercontent.com/martinezelx/gitodile-feedback/main/updates/preview.json` | Preview builds and their stable successor |

These endpoints are planned and do not exist yet. Each is a complete Tauri
static manifest with version, notes/date, and URL/signature entries for the
supported target matrix. Archive the exact manifest as `latest.json` in each
versioned release. Every binary URL names that release's immutable version
tag, not a moving `latest` alias. Only the feed pointers change on promotion.
Account for raw-content caching: promotion is eventually visible, not instant.

GitHub excludes drafts and prereleases from its latest-release selection, so
`releases/latest/download/latest.json` alone does not cover the current preview
product. Keep correct GitHub prerelease flags rather than mislabeling preview as
stable to make the endpoint work. See the [release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release).

There are exactly two release channels: `stable` and `preview`. Do not add
alpha, beta, RC, or nightly channels. Derive the installed feed from checked
build metadata; no channel picker or arbitrary endpoint field in the first
implementation. Preview builds use preview, stable builds use stable.
A stable publication can advance preview too if it does
not replace a newer preview. Once that stable build runs it follows stable.
Preview and stable initially replace the same app identity; side-by-side
installation is a separate decision.

Enforce matching versions in npm, Cargo, Tauri, release tags, manifests, and
the installed release model. New preview builds use real SemVer prerelease
versions in the form `X.Y.Z-preview.N`, not only a display badge. Stable versions
are `X.Y.Z`, without a `-stable` suffix. Account for the current `0.1.0` baseline:
`0.1.0-preview.1` is older, not a forward update. The initial label-only rename
kept `0.1.0`; the user subsequently approved preparing `0.2.0-preview.1` on its
own version branch. A version under development is not yet a published release:
keep its publication date absent until it ships. Keep normal newer-version checks;
stable must also reject a prerelease accidentally placed in its feed. A missing
feed/target is unavailable or unsupported, never proof of being up to date.
Initialize a channel with a valid manifest before shipping clients using it.
Existing updater-less builds require a manual installer upgrade to the first
updater-enabled build; that build can then receive subsequent signed updates.

This needs no custom update server, account, client-side token, or runtime
GitHub REST release listing. [GitHub documents](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
up to 1,000 assets per release, each under 2 GiB, with no total release-size or
bandwidth limit. Private CI minutes, signing services, and platform QA remain
separate costs. Retain these public paths for installed clients if hosting
changes later; a future owned domain can be introduced through a bridge build.

### Signing and publication

#### One main branch, version branches, immutable release tags

Both channels live in `main`'s history. There is no permanent `stable`,
`preview`, or `develop` branch. The user-requested release workflow is:

1. Create a short-lived branch from `main` named for the exact version, for
   example `0.2.0-preview.1`. Routine work can continue to follow the existing
   direct-to-main convention; this branch is release preparation.
2. Prepare that version and its notes, run the required checks, and merge the
   release PR into `main`.
3. Tag the exact merged commit `v0.2.0-preview.1`. Create/push the tag only
   after the merged result passes the gate. Tagging a moving branch head later
   must not accidentally include unreviewed intervening changes.
4. The private publication workflow runs on the version tag. It checks that
   the tagged commit belongs to `main`'s history and that all version metadata
   matches, then derives the release channel and GitHub prerelease flag from
   the version. Ordinary pushes/merges into `main` do not publish a release.
5. Repeat for `0.2.0-preview.2`, then prepare and tag `0.2.0` when ready for a
   stable release. These are illustrative versions, not a release schedule.

| Source version / tag | Channel | GitHub prerelease | Feed publication |
| --- | --- | --- | --- |
| `0.2.0-preview.1` / `v0.2.0-preview.1` | `preview` | `true` | `preview.json` only |
| `0.2.0-preview.2` / `v0.2.0-preview.2` | `preview` | `true` | `preview.json` only |
| `0.2.0` / `v0.2.0` | `stable` | `false` | `stable.json`; also preview if newer than its current candidate |

The branch name helps humans; the checked version tag is the release identity.
There is no separate free-form channel input or manual GitHub flag that may
contradict it. Reject other prerelease suffixes, malformed versions, mismatched
metadata, and tags outside `main` before signing or publication.

Preserve existing published Git tags at their original commits, including
legacy tags from before this pipeline. A historical tag does not certify a
current release or retroactively publish artifacts. Add retroactive version
tags only when their version/build identity is supported by evidence; use a
separate `milestone/` namespace for optional development landmarks, excluded
from the version publisher. Do not invent historical releases or their dates.

SemVer orders `0.2.0-preview.1 < 0.2.0-preview.2 < 0.2.0`. A stable promotion is
a newly versioned and signed build, even when the functional code matches the
last preview. Editing that preview release's GitHub flag does not change the
installed version and must not be used as promotion. See the
[SemVer specification](https://semver.org/).

The head of `main` can be preview while stable users receive the last stable
tag. A stable release includes all changes in its tagged commit, so keep one
release train: validate the entire candidate before marking it stable. A
separate maintenance/hotfix line can be decided if backports become necessary;
this workflow does not pretend to exclude unready changes already on `main`.

#### Artifact trust and publishing order

Use Tauri's mandatory artifact signature verification with a pinned public
key and HTTPS. Keep the production private key/password in protected CI
secrets with a recoverable offline backup. Development tests use a separate
key and feed. Do not distribute credentials, permit insecure production
transport, or accept endpoints/keys/artifact paths supplied by the renderer.
Tauri signs the artifact, not the whole JSON manifest: protect feed writes,
validate metadata and release URLs, and render remote notes as bounded plain
text. Consult [Tauri's updater contract](https://v2.tauri.app/plugin/updater/).

Treat updater signing and operating-system signing as separate requirements:
Windows Authenticode and macOS Developer ID/notarization are not supplied by
the updater key. Sign/package in the correct order so the updater signature
covers the final bytes. Follow the [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/)
and [macOS signing guide](https://v2.tauri.app/distribute/sign/macos/).

Build in private CI from a verified source tag. Restrict signing/publishing to
trusted release runs; pin third-party actions to reviewed commits. Use a
short-lived GitHub App installation token scoped to the public destination
with Contents write permission. A repository-scoped, expiring fine-grained
PAT is an acceptable initial alternative. The workflow's automatic
[`GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token)
cannot write another repository. The destination credential belongs only in
the publishing job, not the app or ordinary PR builds.

Use one publication coordinator after the build matrix, not competing matrix
jobs that overwrite the same manifest. [Tauri Action](https://github.com/tauri-apps/tauri-action)
supports publishing to a different owner/repository; its `releaseCommitish`
must identify the public destination when it creates that tag. The pipeline:

1. Builds and signs each supported artifact, retaining private CI artifacts.
2. Assembles a single manifest; verifies versions, target coverage, signatures,
   hashes, names, and URLs. Failing any required target prevents promotion.
3. Uploads all assets, manifest, hashes, notices, and reviewed notes into one
   draft public release. Finalized version tags/assets are not overwritten.
4. Publishes the verified release, then checks anonymous access to the actual
   downloads. Failed checks leave the current feed untouched.
5. Advances the selected feed in one serialized, conflict-checked commit only
   after all checks pass. An older concurrent run cannot regress a feed.

Reconcile completed steps before retrying uncertain publication results. Do
not regenerate or replace a finalized signed asset under an existing version.
Review the public repository README/download guidance while preserving the
issue-form contract. Run `check:publication` before publishing desktop builds.

### Desktop ownership and user flow

Use a small `app-updates` feature with a controller, typed port, Tauri adapter,
and eager update UI. The shell supplies existing menu/palette/Changelog entry
points and coordination. Opening Changelog still reads bundled notes only;
checking remote releases is a separate explicit action. No new screen is
needed. Settings owns the user preference through a narrow public contract.

Rust owns pending update handles, verification, and installer invocation in
`app_updates.rs`; `ipc.rs` adapts narrow commands and `lib.rs` only registers
them. Keep policy checks in `application.rs`, including process-wide admission
for installation. Classify metadata checks as read-only, staging downloads as
local mutation, and installation/restart as a platform mutation. The plugin's
Rust API avoids granting the WebView direct install/relaunch capabilities.

Start with manual checking plus an explicitly enabled background-check
preference, off by default. When enabled, check after startup has settled and
at most once per 24 hours while the app runs; never on screen visibility or
repository activation. Deduplicate manual/automatic requests, use bounded
timeouts, and avoid retry storms. Never download or install automatically.
Disclose contact with GitHub, which necessarily sees ordinary request metadata
such as IP address; transmit no project data or persistent installation ID.

Present available version, channel, notes, and download progress; then offer
an explicit **Install and restart** action and postponement. Model checking,
current, available, downloading, verifying, ready, blocked, installing,
unavailable, and failed states. Unknown transfer length needs an honest progress
indicator. A finished transfer is not yet a verified update: the inspected
[plugin implementation](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs)
emits download-finished before verifying its signature and buffers the download
in memory. Mark ready only after successful verification, retain at most one
candidate, and measure peak memory with representative bundled-runtime size.
Do not promise resumable or cross-launch downloads in the first version.
Cancellation is a distinct normal terminal state for a check or download, not
a generic failure and never an installable result. The native service keeps at
most one immutable candidate; renderer commands can refer to its opaque ID but
cannot replace any of its validated release fields.

Before invoking the installer:

- Acquire native app-wide admission that prevents new operations from racing
  the final busy check, across all projects and global clone/create/tooling
  operations. Never kill a mutation, hook, or credential operation to update.
- Suspend automatic work; finish or safely cancel/drain read-only work and
  stop app-owned watchers/processes through their normal lifecycle. External
  tools editing a repository are outside this gate and are not terminated.
- Protect volatile frontend work such as version descriptions and conflict
  editor buffers: persist/restore supported drafts or block installation with
  an actionable explanation. Dirty files already on disk are not a reason to
  force a commit, stash, reset, or recovery snapshot.
- Revalidate the candidate and current installation eligibility. On a
  pre-install failure release admission and restore normal app behavior.

Windows exits during installation, so deferring only a later `relaunch()` is
too late to protect operations or UI work. Use the supported installer handoff
and confirm the resulting version on the next launch. Do not declare success
just because the old process exited. If the result is uncertain, explain it
and provide a public reinstall link; do not loop an unattended install.

### Platform contract and recovery

Initial candidate matrix, subject to actual artifact validation:

| Installation | Proposed update behavior |
| --- | --- |
| Windows x64 | NSIS per-user installation, passive installer progress; one installer family in the feed |
| macOS Apple Silicon / Intel | Signed/notarized app; DMG for first install and signed `.app.tar.gz` for updating |
| Linux x64 AppImage | Signed AppImage replacement, after checking the actual writable installed file |
| Linux `.deb` / `.rpm`, managed or read-only installs | Explain manual/package-manager update; do not overwrite them with an AppImage |

All rows are candidates, not current support claims. Each exact target remains
disabled for production automatic updates until two real consecutive signed
packages pass the installation evidence required by task 065-9-7. In
particular, the official Tauri updater repository had an open macOS
[replacement-safety report](https://github.com/tauri-apps/plugins-workspace/issues/3505)
when contracts were fixed on 2026-09-09; macOS cannot be enabled without a
reviewed fix or independently tested mitigation.

Support detection includes the packaging/installation mode, not just OS/CPU.
Keep downloads for documented Linux package formats available alongside
AppImage. Expanding architectures, store packages, and package repositories is
separate work. Test normal install locations, spaces/non-ASCII paths, file
locks, permissions, low disk space, and bundled child-process shutdown. A
binary compiled on CI is not sufficient platform evidence.

Keep old signed installers available and document reinstall and settings-format
compatibility. Prefer a higher-version repair release over forced downgrade.
Reverting a feed stops offering that update after caches expire; it does not
undo an installation or recall a downloaded candidate. Tauri is not a complete
automatic rollback system. No updater path mutates user repositories.

Document key loss and compromise responses. Planned rotation needs a tested
bridge signed with the old key that trusts the new one; losing the old key
before that bridge generally requires manual reinstall for old clients. Never
disable verification to recover the channel. Preserve forward-compatible
settings where possible and back up app data before destructive migrations.

## External implementation evidence

Sources inspected on 2026-09-03; these are observations, not code to import.

- **GitButler**, commit `5454f68ef82c10a7299f3f70b9ed3cac68e05e29`: its
  [release configuration](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/crates/gitbutler-tauri/tauri.conf.release.json)
  points at a first-party endpoint parameterized by platform and installed
  version. Its [updater service](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/apps/desktop/src/lib/updater/updater.ts)
  separates checks, downloads, installation, restart, and manual/background
  errors; read-only installations receive external update guidance. Reusable
  principle: own update policy and failure states above the plugin. A custom
  release service serves their needs but is unnecessary for GitOdile's first
  channel. Its [license](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/LICENSE.md)
  is FSL-1.1-MIT; this proposal adapts no source, assets, or product copy.
- **Yaak**, commit `d2d4b80a094b23b53c65b83e4ae42df53f51fbd1`: its
  [workflow](https://github.com/mountain-loop/yaak/blob/d2d4b80a094b23b53c65b83e4ae42df53f51fbd1/.github/workflows/release-app.yml)
  builds platform artifacts with Tauri Action into draft GitHub Releases and
  supplies updater and OS-signing credentials separately. Its
  [native update service](https://github.com/mountain-loop/yaak/blob/d2d4b80a094b23b53c65b83e4ae42df53f51fbd1/crates-tauri/yaak-app-client/src/updates.rs)
  distinguishes channels, user/background checks, installation modes, and
  shuts down an owned helper before Windows replacement. Reusable principle:
  packaging and child-process lifecycle are part of update correctness.
  GitOdile does not need its identification headers or extra update UI modes.
- **CrabNebula Cloud** is a hosted distribution/update option documented by
  [Tauri](https://v2.tauri.app/distribute/crabnebula-cloud/). It is an alternative
  when managed distribution justifies another service, not a prerequisite of
  the official updater.

## Consequences

- Public downloads work without exposing application source or requiring an
  account. One existing public destination handles support and releases.
- Updater correctness includes publication ordering, native shutdown, draft
  protection, and installed-package evidence; adding a plugin alone is not done.
- GitHub availability, caching, public-repository continuity, signing-key
  custody, and destination write credentials become release dependencies.
- Static feeds provide channels but no per-user rollout, forced-update policy,
  or automatic rollback. Add a dynamic service only against a concrete need.
- Hosting/signing credentials, certificates, the actual supported matrix,
  and the first release version must be configured/verified during execution.
  General public-release gates remain with task 065-8, including the existing
  product-name clearance requirement in the product strategy.

## Alternatives considered

- **Private source-repository Releases:** require user access or a distributing
  proxy. Embedding a GitHub credential in the app is not acceptable.
- **A third public releases-only repository:** technically equivalent but adds
  another destination without a current ownership/access requirement. Revisit
  if support and publishing need different maintainers or permissions.
- **GitHub's single latest-release URL:** excellent for stable-only products;
  insufficient for the existing preview lifecycle without extra channel policy.
- **Owned API plus object storage/CDN:** useful for staged rollouts, richer
  compatibility selection, or a portable branded endpoint. Adds infrastructure
  and operations before those requirements exist.
- **Managed distribution such as CrabNebula:** reduces service ownership but
  introduces an external vendor and plan choice; not needed for this scope.
- **Manual installers only:** retain as recovery and for unsupported package
  modes, but they do not satisfy the requested in-app update experience.
