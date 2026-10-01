---
id: 143
title: Turn release/0.3.0-preview.1 into release/0.3.0 and ship it on the single channel
status: active
priority: high
type: release
areas:
  - release
  - frontend
  - documentation
created: 2026-10-01
completed:
parent:
queue: "02"
---

# Goal

Bring task 142 into the pending release branch, turn
`release/0.3.0-preview.1` into `release/0.3.0`, and publish `0.3.0` as the
first single-channel release, proving that installed `0.2.0-preview.*` clients
are offered it.

# User outcome

Everyone on a `0.2.0-preview.*` build is offered `0.3.0` in the app; after
installing it they follow the single feed for every later version.

# Context

`release/0.3.0-preview.1` (pushed, no pull request) is 68 commits ahead of
`main`, including preview-only UI that task 142 never saw on `main`: the
preview build glyph (9b76fd8) and anything that marks a build as preview in the
status bar, About, What's new or the update dialog.

`release-prepare.mjs` refuses to run on a `release/*` branch of another
version, so the branch is first renamed back to a work branch.

# Scope

1. Merge `origin/main` (with task 142) into the release branch; resolve
   conflicts in favour of the one-channel model.
2. Remove the remaining preview-only UI and copy on the branch (glyph, labels,
   tests, translations); `channelGlyph` goes if nothing uses it.
3. `git branch -m release/0.3.0-preview.1 feature/0.3.0`, then
   `pnpm run release:prepare 0.3.0` (renames to `release/0.3.0`, bumps
   package.json, Cargo.toml, Cargo.lock, tauri.conf.json and README).
4. Move the curated content of `docs/release/notes/v0.3.0-preview.1.md` and
   `docs/release/highlights/v0.3.0-preview.1.json` into the `v0.3.0` files,
   delete the never-released preview.1 files, run `pnpm run release:notes`.
5. Push `release/0.3.0`; delete the remote `release/0.3.0-preview.1` only with
   the maintainer's confirmation; open the pull request to `main`.
6. After the maintainer merges it, check the publication: tag `v0.3.0`, a
   non-prerelease GitHub release with Windows NSIS and Linux AppImage assets,
   `updates/latest.json` and `updates/preview.json` both at `0.3.0`, no
   `stable.json`.
7. Installed check: a Windows install of `0.2.0-preview.12` is offered `0.3.0`,
   installs it, and the restarted `0.3.0` reports it is current from
   `latest.json`.

# Out of scope

- Any code change task 142 owns; fix it there (on `main`) if it is wrong.
- New product work for 0.3.0.

# Acceptance criteria

- [ ] `release/0.3.0` contains `origin/main`, carries no `.github/` or
      `scripts/release/` change, and `release/0.3.0-preview.1` no longer exists
      locally (remote only if the maintainer confirmed).
- [ ] No preview-channel UI or copy remains on the branch.
- [ ] Notes and highlights for `v0.3.0` are curated and agree
      (`release:notes`); the preview.1 files are gone.
- [ ] `pnpm run check` passes on `release/0.3.0`.
- [ ] Publication verified as in scope step 6.
- [ ] `0.2.0-preview.12` → `0.3.0` verified on a real Windows install.

# Relevant files

- `scripts/release/release-prepare.mjs`
- `docs/release/notes/`, `docs/release/highlights/`
- `src/app/StatusBar.tsx`, `src/app/ChangelogDialog.tsx`,
  `src/shared/ui/channelGlyph.tsx`, `src/features/app-updates/`

# Dependencies

- Task 142 merged into `main`.
- The `public-release` environment from task 142's operational steps exists.
- The independent offline updater-key backup that
  `docs/release/signed-builds.md` requires before the first `X.Y.Z` release
  is made and its custody recorded (maintainer).

# Decisions

# Implementation notes

# Validation
