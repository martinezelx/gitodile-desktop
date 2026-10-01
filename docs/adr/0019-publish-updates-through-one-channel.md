# ADR 0019: Publish updates through one channel

- Status: accepted
- Date: 2026-10-01

This ADR supersedes the channel model of
[ADR 0010](0010-distribute-signed-app-updates-through-public-github-releases.md):
its `stable` and `preview` channels, the two feeds, the closed channel choice
added by its 2026-09-15 amendment, and the four publication modes. Hosting,
signing, the merge-driven pipeline, publication order, the installed-update
contract and the target matrix in ADR 0010 are unchanged.

Amendment, 2026-10-01 (same day, after `0.3.0` shipped and updated a real
install): the maintainer retired every remaining trace of the old shape. The
`0.2.0-preview.N` versions are renumbered `0.2.N` in tags, notes and
highlights; their public prereleases are deleted; the legacy feed mirror is
no longer written and its file is removed from the public repository; and no
code reads the old version shape any more. Builds older than `0.3.0` are no
longer offered updates and need a manual reinstall, which the maintainer
accepted because no one relies on them. The decisions below about the mirror
and legacy versions are historical.

## Context

ADR 0010 published two channels from one `main`: `X.Y.Z-preview.N` versions to
`updates/preview.json` as GitHub prereleases, and `X.Y.Z` versions to
`updates/stable.json` (and to `preview.json` when newer). Task 065-9-12 added a
Settings choice between the two feeds and a `stable-testing` mode, so both
channels needed their own environment, notice, mode, tests and qualification
path.

Observed on 2026-10-01:

- Only previews were ever published (`0.2.0-preview.10` to `.12`). `stable.json`
  was never created, and no stable release exists.
- The newest shipped build, `0.2.0-preview.12`, predates the channel choice.
  Every installed updater-enabled client reads `preview.json` and only that
  URL; none reads `stable.json` or has a stored channel preference.
- The product is iterating quickly with a small audience. Every release goes
  to the same people, so the preview/stable split adds a version shape, a
  feed, a GitHub flag, a Settings control, two publication modes and a second
  environment without separating any audience.

## Decision

There is one release channel.

- A release version is plain `X.Y.Z`. `-preview.N` and every other prerelease
  suffix are refused by `release:prepare`, the merge coordinator, the
  candidate validator, the pipeline and the publisher. No release is a GitHub
  prerelease.
- Builds follow one compiled feed,
  `https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/latest.json`.
  The name carries no channel word; no client read the old `stable.json`, so
  the name was free. The renderer has no channel command or control, and the
  native updater stores no preference.
- A build offers only an `X.Y.Z` candidate newer than itself. The running
  build's own version may still be a legacy `X.Y.Z-preview.N` (every install
  up to `0.2.0-preview.12`, and `main` until it releases `0.3.0`); that shape
  stays readable for installed versions, history, highlights and ordering, in
  which every `X.Y.Z-preview.N` precedes `X.Y.Z`. It is never published again.
- Every publication writes the same manifest bytes to `latest.json` and to
  `preview.json`, in the same conflict-checked commit and under the same
  no-regression rule. `preview.json` is a legacy mirror so installed
  `0.2.0-preview.*` builds are offered the next release; once they install it
  they follow `latest.json`. Retire the mirror only after a release note has
  announced it, accepting that any `0.2.0-preview.*` install left then needs a
  manual reinstall. `stable.json` is never created.
- Two publication modes remain: `testing` (Tauri updater signature, no
  platform qualification, the fixed bilingual testing notice) and
  `production` (the qualification registry proves every enabled target and
  production approval). The mode is derived from the registry alone.
- Every release publishes through one `public-release` environment. Whether
  it requires a reviewer is a repository setting, not a code decision.
- The release workflow is: `pnpm run release:prepare X.Y.Z` from `main` when a
  version starts, develop it on `release/X.Y.Z`, merge its pull request into
  `main` to tag and publish. The protected-path rule for `.github/` and
  `scripts/release/` is unchanged.

## Consequences

- One version shape, feed, mode family and environment: less code in the
  updater, the Settings screen, the scripts, the workflow and the tests.
- Every merged release reaches every installation. There is no earlier ring
  to try a build on; a bad release is handled as before, by withdrawing it
  from the feed and publishing a higher-version repair.
- Installed `0.2.0-preview.*` builds keep updating through the mirror until it
  is retired.
- Qualification evidence is a transition between two public releases; build
  A may be a legacy preview install, which reads B from the mirror.
- Operational changes belong to the maintainer: create `public-release` with
  `GITODILE_PUBLIC_RELEASE_TOKEN`, decide its reviewer, and delete
  `public-release-preview` and `public-release-stable` after the first
  single-channel release succeeds.
- Amendment, 2026-10-01: the offline updater-key backup that
  `docs/release/signed-builds.md` used to require before the first stable
  release is deferred to `1.0.0` by the maintainer (task 065-8), accepting
  that losing the key before then would strand installed builds.

## Alternatives considered

- **Keep both channels and only stop publishing previews.** Needs no code
  change, but keeps the channel choice, four modes, two environments and the
  `stable`/`preview` vocabulary in every surface for a channel nobody uses.
- **Keep `stable.json` as the single feed name.** Equally possible, since no
  client read it, but keeps a channel word for a model that has none.
- **Stop writing `preview.json`.** Strands every installed updater-enabled
  client on its current version until a manual reinstall.
- **A rolling preview ring later.** If a ring before general release becomes
  necessary, decide it in a new ADR against a concrete audience rather than
  restoring this model by default.
