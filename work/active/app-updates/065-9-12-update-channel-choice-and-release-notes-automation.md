---
id: 065-9-12
title: Let the user choose the update channel, and finish the release-notes automation
status: active
priority: normal
type: feature
areas:
  - desktop
  - frontend
  - release
  - automation
  - documentation
created: 2026-09-15
completed:
parent: "065-9"
queue: "27"
---

# Goal

Three follow-ups deferred from the updater UI rework shipped in
0.2.0-preview.11 (PRs #34/#35): a user-chosen update channel (stable or
preview) that the native updater honours, release dates taken from the tag
rather than from the day `release:prepare` ran, and public release notes whose
highlight section is generated from the same per-release highlights file the
app's What's new is built from.

# User outcome

- Someone on a stable build can opt into previews from Settings → Updates,
  and someone on a preview build can ask to be offered only stable versions
  from then on. Either way, nothing is downloaded or installed without them.
- The date beside each version in What's new is the day it was actually
  published, not the day the release branch was cut.
- Release notes on GitHub and highlights in the app say the same thing about
  the same version because they are written once.

# Context

**Channel.** Today the channel is a property of the *build*, not a preference:
`build_update_identity` in `src-tauri/src/app_updates.rs` derives it from the
compiled version (`0.2.0-preview.N` → `preview.json`, `X.Y.Z` →
`stable.json`), and the contract (`docs/architecture/app-update-contracts.md`,
"the renderer can request a check; it cannot provide a channel, URL, public
key…") makes that a security invariant: closed enums, fixed feed URLs, no
renderer-supplied routing. `version_decision` rejects every preview candidate
on a stable build (`channel_mismatch`); the preview feed already carries
stable successors, so preview → stable works by itself, and after installing
a stable the build is stable and previews stop. What does not exist is
stable → "show me previews" and preview → "stable only from now on".

The decision on 2026-09-15 was to keep the invariant that the **renderer never
chooses a feed or URL**: the preference is a closed enum persisted natively,
both feed URLs stay compiled in, and Rust picks between them. This is a core
change (Rust + contract JSON and its check + ADR 0010 + UI) and was
deliberately kept out of the visual rework. It only changes anything for a
user once a stable release exists.

**Dates.** `docs/release/highlights/v<version>.json` carries `date`, stamped
by `release:prepare` as the day the release was cut (see
`scripts/release/highlights.mjs`, `todayIsoDate`). The truthful date is the
tag's; reading it at build time (`git log -1 --format=%cs refs/tags/v<version>`)
was rejected for now because the `build` job of `release-pipeline.yml` checks
out `ref: sha` without tags, so the date would silently be null unless the
checkout fetches tags. DESIGN.md currently states "The date is the day the
release was cut."

**Notes.** `docs/release/notes/v<version>.md` (English Markdown, copied to the
GitHub release and reduced to plain text for the updater manifest) and the
highlights JSON (bilingual, one glyph per line, shown in What's new) are
written separately. For preview.11 the same sentences were typed twice.

# Scope

## A. Update channel preference

- Persist a `preferred_channel: "follow_build" | "stable" | "preview"` in the
  native app-local data directory (beside the install handoff file
  `AppUpdateService::new` already derives from `app_local_data_dir()`), never
  in renderer storage. `follow_build` is the default and reproduces today's
  behaviour exactly.
- Extend `BuildUpdateIdentity` resolution so the *effective* channel is
  `preferred_channel` when set, else the build channel; the feed is chosen
  from the effective channel between the two compiled `KnownFeed` values.
  `version_decision` accepts a newer preview on a stable build only when the
  effective channel is `preview`, and filters preview candidates out on a
  preview build when the effective channel is `stable` (result `current`,
  never an error, when the newest acceptable candidate is not newer).
- Add narrow IPC: read the preference; set it (validated against the closed
  enum, rejected while a check, download or install is active). The renderer
  still cannot pass a channel to `check`.
- Contract: add `preferredChannel` to the relevant `versionCases` in
  `docs/architecture/065-9-1-app-update-contract.json`, extend
  `scripts/check-app-update-contracts.mjs` to evaluate it, and add the
  matching Rust unit cases next to
  `version_decisions_cover_equal_older_upgrade_and_channel_mismatch`.
- UI: in Settings → Updates (`AppUpdateSettingsControl` in
  `src/features/app-updates/UpdateDialog.tsx`), a segmented control
  "Channel: Stable / Preview" under the installed-version row, with one short
  sentence per option in both languages (previews arrive earlier and may
  break; stable is what most people should run). The control shows the
  effective channel; `follow_build` is presented as whichever it resolves to,
  not as a third option. Changing it clears a stale `available`/`ready` state
  and offers "Check for updates".
- Docs: `docs/architecture/app-update-contracts.md` (feed identity section),
  ADR 0010 (amend the "channel is derived from the version" rule), DESIGN.md
  (Updates section), `docs/release/highlights/v<next>.json` line.

## B. Release date from the tag

- In `vite.config.ts`, resolve `__APP_RELEASE_DATES__` (or fold into the
  highlights assembly in `src/app/appRelease.ts`) from
  `git log -1 --format=%cs refs/tags/v<version>` for every highlights file
  whose tag exists; fall back to the file's `date` when it does not (dev
  checkout, the running candidate before its tag).
- Make the `build` job's checkout in `.github/workflows/release-pipeline.yml`
  fetch tags (`fetch-tags: true` or `fetch-depth: 0`) so published builds
  carry real dates, and add an assertion in the pipeline or `check:release`
  that the running version's tag resolved when building a tagged release.
- Update the "day the release was cut" wording in DESIGN.md and
  `docs/release/highlights/README.md`.

## C. One source for notes and highlights

- Extend `release:prepare` (`scripts/release/release-prepare.mjs`) or add
  `release:notes` so the `## Highlights` section of
  `docs/release/notes/v<version>.md` is rendered from the English lines of
  `docs/release/highlights/v<version>.json`, between markers the script owns;
  the rest of the notes stays hand-written. Re-running regenerates only the
  marked block.
- Have the merge coordinator (`validateReleasePreparation` in
  `scripts/release/merge-release.mjs`) fail with `notes_incomplete` when the
  marked block is missing or does not match the highlights file, so the two
  cannot drift at tag time.
- Update `docs/release/notes/README.md`, `docs/release/highlights/README.md`
  and `docs/release/public-publishing.md`.

# Out of scope

- A third feed or any renderer-supplied URL, key, target or header.
- Letting a stable build downgrade to a preview, or any downgrade at all.
- Generating highlight *sentences* from commit messages; they stay
  hand-written in both languages.
- macOS delivery (065-10) and Authenticode (065-9-9).

# Acceptance criteria

- [ ] With `follow_build` (default) every existing contract case, Rust test and
      frontend test passes unchanged.
- [ ] A stable build with `preview` preferred is offered a newer preview and
      still refuses older ones; a preview build with `stable` preferred is
      offered only stable successors and reports `current` otherwise. Both
      covered in `065-9-1-app-update-contract.json`, the contract check and
      Rust unit tests.
- [ ] The renderer cannot influence feed, URL or key: the IPC contract test in
      `src/architecture/ipcContract.test.ts` and the Rust `ipc` contract test
      show only the closed-enum preference command.
- [ ] Settings → Updates shows the channel control with per-option copy in EN
      and ES, keyboard-navigable like the other radio groups, and a
      `UpdateDialog.test.tsx` case for switching and re-checking.
- [ ] What's new shows the tag date for every published version in a tagged
      build; the dev build falls back to the file date; the pipeline fails
      loudly if a tagged build could not resolve its own tag.
- [ ] `release:prepare` renders the highlights block into the notes; the
      coordinator refuses a mismatch; `scripts/release/*.test.mjs` cover both.
- [ ] ADR 0010, `app-update-contracts.md`, DESIGN.md and the two release
      READMEs describe the new behaviour; `pnpm run check` passes and is
      recorded below.

# Relevant files

- `src-tauri/src/app_updates.rs` (`build_update_identity`, `version_decision`,
  `AppUpdateService::new`, `production_target_is_enabled`)
- `src-tauri/src/ipc.rs`, `src-tauri/src/application.rs`
- `docs/architecture/065-9-1-app-update-contract.json`,
  `scripts/check-app-update-contracts.mjs`,
  `docs/architecture/app-update-contracts.md`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `src/features/app-updates/` (`domain.ts`, `port.ts`, `tauriAdapter.ts`,
  `controller.ts`, `UpdateDialog.tsx`, `translations.ts`, tests)
- `src/app/appRelease.ts`, `vite.config.ts`, `src/vite-env.d.ts`
- `scripts/release/highlights.mjs`, `release-prepare.mjs`,
  `merge-release.mjs` and their tests
- `.github/workflows/release-pipeline.yml`
- `DESIGN.md`, `docs/release/highlights/README.md`,
  `docs/release/notes/README.md`, `docs/release/public-publishing.md`

# Dependencies

- Part A is only observable once a stable release exists; it can be built and
  tested against the contract before then.
- 065-9-11 touches `finish_check` and the contract JSON; land it first or
  coordinate the contract edits.

# Decisions

- 2026-09-15: the channel preference lives in Rust as a closed enum; the
  renderer never names a feed. The preference is a *choice between the two
  compiled feeds*, not a new routing input.
- 2026-09-15: highlight sentences remain hand-written and bilingual; only the
  assembly, validation, dating and the English block in the public notes are
  automated.
- 2026-09-15: parts B and C were deferred from preview.11 to keep the release
  pipeline untouched while the first preview-to-preview update test runs.

# Implementation notes

Complete this section during implementation.

# Validation

Record the exact commands run and their results.
