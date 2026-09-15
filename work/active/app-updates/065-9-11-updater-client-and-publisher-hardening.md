---
id: 065-9-11
title: Harden the updater client and publisher after the first public preview updates
status: active
priority: high
type: feature
areas:
  - desktop
  - release
  - automation
  - documentation
created: 2026-09-15
completed:
parent: "065-9"
queue: "06"
---

# Goal

Close the correctness and forward-compatibility findings from the 2026-09-14
updater/release review that remain open after the single release pipeline
shipped `0.2.0-preview.10` and an installed client updated itself to
`0.2.0-preview.11` through the public `preview.json` feed.

# User outcome

- A client whose build cannot install updates says so at check time, in plain
  words, instead of downloading a package and then refusing it with a message
  about "managed installations".
- Enabling macOS in the feed later (task 065-10) does not silently strand every
  Windows and Linux client already installed.
- A GitOdile installed in a custom directory on Windows is still updatable.
- Release notes in the update dialog keep their paragraphs and bullets, and the
  shown publication date is the real one.
- Once both targets are qualified, previews stop carrying the "not qualified"
  notice.

# Context

The review on 2026-09-14 (recorded in the ADR 0010 amendment and in this
epic's session history) consolidated the release pipeline, retired the
internal validation route and fixed the publisher against real GitHub
behaviour. Four defects were found only when the pipeline first ran against
GitHub (run-name reported in `name`, drafts invisible to the tag lookup,
non-reproducible installers versus a filled draft, `.cmd` spawning on
Windows); each now has an end-to-end test. The findings below were identified
in the same review but deliberately left for a separate task so the first
public previews could ship.

Observed facts this task relies on:

- `finish_check` in `src-tauri/src/app_updates.rs` consults only
  `installation_error(mode)`; `target_is_enabled` is checked in
  `revalidate_install_candidate`, after download and verification.
- `validate_raw_manifest` requires exactly the four top-level keys and rejects
  any `platforms` key other than `windows-x86_64`/`linux-x86_64`, so a feed
  that gains `darwin-*` entries is `invalid_manifest` for every existing
  client.
- `detect_installation_mode` classifies an NSIS install as per-user only when
  the executable lives under `%LOCALAPPDATA%`, and its temp-directory check
  compares a canonicalized (`\\?\`) path with a non-canonicalized one, so it
  never matches on Windows.
- `tauri-plugin-updater 2.11.0` logs and discards a non-2xx feed status
  (`updater.rs` around line 557), ending in `ReleaseNotFound`; the contract's
  `http_status` error is unreachable during a check.
- The `stage` job derives the publication mode from the channel alone, so
  every preview is `preview-testing` and carries `PREVIEW_TESTING_NOTICE`
  even after qualification.
- `normalizeNotes` in `scripts/release/public-release.mjs` collapses all
  whitespace to single spaces; `plain_text_notes` in Rust preserves `\n`.
- `pub_date` is the merge commit's committer date (preview.11: commit
  10:51Z, publication 11:13Z).
- `publish()` in `scripts/release/github-publication.mjs` downloads assets
  anonymously immediately after `PATCH draft:false` with no retry; a CDN
  delay would fail a publication that is otherwise complete.
- `release-pipeline.yml` `validate` accepts a coordinator run whose `status`
  is `completed` regardless of `conclusion`.

# Scope

Client (`src-tauri/src/app_updates.rs`, contract JSON and fixture):

- Report an update the build cannot install at **check** time. When
  `target_is_enabled` is false for the current target, `finish_check`
  produces `blocked` with a new error code (working name
  `automatic_update_not_enabled`) and a message that names the manual
  download; `unsupported_installation` is reserved for managed/store/mounted
  installations. Add the code to `065-9-1-app-update-contract.json`, the
  Rust enum, the TypeScript `domain.ts`, both translation dictionaries and
  the contract check.
- Make manifest validation forward-compatible. Validate strictly only the
  entry for the running target (url origin/path, signature bounds, size);
  tolerate unknown `platforms` keys and unknown top-level keys within the
  existing byte and entry limits; keep rejecting a missing target, a
  malformed own entry and oversized payloads. Update
  `docs/architecture/app-update-contracts.md` and ADR 0010, which currently
  say the client fails closed on any macOS key.
- Detect Windows NSIS per-user installation from the uninstall registry key
  (HKCU vs HKLM `Software\Microsoft\Windows\CurrentVersion\Uninstall`) rather
  than the install directory, keeping the writable-directory probe; fix the
  temp-directory comparison so both sides are canonicalized or neither is.
- Record in the contract document that `http_status` cannot be produced by a
  check with the pinned plugin; do not promise it in the UI.

Publisher (`scripts/release/`):

- Derive the publication mode from the qualification registry: a preview
  whose enabled targets are all `qualified` and whose production approval is
  enabled publishes without `PREVIEW_TESTING_NOTICE`; otherwise
  `preview-testing` as today. Stable behaviour unchanged.
- Preserve structure in manifest notes: collapse horizontal whitespace and
  runs of more than two newlines, keep single newlines; keep the 16 KiB
  bound.
- Set `pub_date` to the actual publication time. Because assets and the
  manifest must stay byte-identical across retries, record the timestamp
  once (first successful `PATCH draft:false`) and reuse it on
  reconciliation; the release's `published_at` from the API is the natural
  source of truth for a retry.
- Add a bounded retry (for example 6 attempts, 10 s apart) to the anonymous
  download check after publishing; a persistent failure still stops the run
  before any feed change.
- Require `conclusion == "success"` for a completed coordinator run in the
  `validate` job of `release-pipeline.yml` (in-progress runs remain
  accepted).

Tests and documentation:

- Rust unit tests for the new check-time block, the tolerant manifest
  parser (feed with `darwin-*` keys and extra top-level fields), and the
  registry-based installation-mode detection (behind `cfg(windows)`).
- Release-script tests for mode derivation from a qualified registry, notes
  normalization, `pub_date` reuse on retry, the anonymous-download retry and
  the coordinator conclusion check; keep the end-to-end publisher tests green.
- Update `docs/release/public-publishing.md`, `signed-builds.md` and the
  update contracts document where behaviour changes.

# Out of scope

- Windows Authenticode and macOS signing/notarization (ADR 0011; revisit at
  1.0).
- Enabling any macOS target or feed entry (task 065-10).
- Recording qualification evidence for Windows/Linux (tasks 065-9-7 and
  065-9-8); this task only makes the publisher honour a qualified registry.
- Reducing CI's triple frontend build or adding `cargo deny`/`pnpm audit`.
- Replacing `raw.githubusercontent.com` feeds or adding a dynamic update
  service.

# Acceptance criteria

- [ ] A build compiled without either target gate reports `blocked` with the
      new error code on check, downloads nothing, and offers the manual
      download; a gated build behaves exactly as `0.2.0-preview.11` does.
- [ ] A `preview.json` containing `darwin-aarch64` and `darwin-x86_64`
      entries plus an unknown top-level field is accepted by a Windows and a
      Linux client, which select their own entry; a manifest lacking the
      running target still yields `target_unavailable`.
- [ ] An NSIS per-user installation in a custom directory is classified
      `windows_nsis_per_user`; a machine-wide (HKLM) installation remains
      `windows_machine_wide`.
- [ ] A preview published with a registry that qualifies both enabled
      targets carries no testing notice; a preview published with today's
      registry carries it.
- [ ] Manifest notes keep line breaks; the update dialog renders paragraphs.
- [ ] `pub_date` equals the release's real `published_at` and is identical on
      a reconciliation retry.
- [ ] A simulated 404 on the first anonymous download attempts followed by a
      200 publishes and advances the feed; persistent 404s stop before the
      feed commit.
- [ ] `pnpm run check` passes; `check:release` includes the new cases; the
      contract check accepts the new error code.
- [ ] The first preview built from this task updates an installed
      `0.2.0-preview.11` through the public feed (evidence recorded in
      Implementation notes).

# Relevant files

- `src-tauri/src/app_updates.rs`
- `src-tauri/build.rs`
- `src/features/app-updates/domain.ts`, `translations.ts`, `UpdateDialog.tsx`
- `docs/architecture/065-9-1-app-update-contract.json`
- `docs/architecture/app-update-contracts.md`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `scripts/check-app-update-contracts.mjs`
- `scripts/release/public-release.mjs`, `github-publication.mjs`,
  `qualification-evidence.mjs`
- `scripts/release/public-release.test.mjs`, `release-pipeline.test.mjs`
- `.github/workflows/release-pipeline.yml`
- `docs/release/public-publishing.md`, `docs/release/signed-builds.md`

# Dependencies

- 065-9-10 (merge-driven pipeline) is implemented and proven by
  `0.2.0-preview.10` and `.11`.
- Ships before 065-10 (macOS): the manifest change must be installed on
  clients before any `darwin-*` entry reaches the feed.

# Decisions

- Forward compatibility of the feed is enforced at **publication** (the
  publisher already refuses Darwin rows while 065-10 is open), not by making
  every installed client reject unfamiliar manifests. A client that fails
  closed on a feed it cannot fully parse would need a bridge build with a
  waiting window; tolerance avoids that.
- The check-time block is a distinct error code, not a reuse of
  `unsupported_installation`, because the remedy differs: reinstall a gated
  build versus use a package manager.
- Windows install mode is read from the registry because NSIS per-user
  installs may target any directory; the directory heuristic was a proxy.
- Mode derivation stays deny-by-default: anything short of a fully qualified
  registry keeps the testing notice.

# Implementation notes

Complete during implementation.

# Validation

Record the exact commands run and their results.
