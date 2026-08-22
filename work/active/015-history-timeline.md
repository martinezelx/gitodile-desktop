---
id: 015
title: Browse saved versions in a readable history timeline
status: active
priority: high
type: feature
areas:
  - rust
  - frontend
  - history
created: 2026-07-27
completed:
queue: "01"
---

# Goal

Add a performant, read-only History screen that presents the current version
line as an understandable timeline of saved versions, with technical Git
details available progressively.

# User outcome

The user can see what was saved, who saved it, when it happened, whether it is
local or already reachable from the configured upstream, and which files a
selected version changed.

# Context

The navigation already anticipates a History screen, but it must remain disabled
until this task supplies real data and states. Task 010 creates saved versions;
tasks 011 and 013 provide upstream knowledge that can distinguish local-only
versions from published ones.

This task is intentionally read-only. Comparing arbitrary versions, restoring,
checking out, and rewriting history remain separate safety-sensitive flows.

# Scope

## History contract

- Add a narrow Rust history service and paginated Tauri commands.
- The default timeline follows commits reachable from the active branch `HEAD`,
  including merge commits, in a stable topological/date order.
- Return a typed `HistoryPage` with:
  - repository/session identity and snapshot token;
  - current branch/head state;
  - bounded list of `SavedVersionSummary` values;
  - continuation cursor and `hasMore`;
  - configured upstream boundary when available;
  - shallow-repository and truncation warnings.
- Each summary includes:
  - full/short commit ID and parent IDs;
  - subject and bounded body/description;
  - author display name/email and authored timestamp;
  - committed timestamp when materially different;
  - local branch, remote-branch, tag, and `HEAD` decorations;
  - root/merge indicators;
  - local-only/published/unknown reachability relative to the selected upstream.
- Use machine-readable, delimiter-safe Git output. Treat commit messages,
  identities, refs, paths, and signatures as untrusted data.
- Cap page size and individual text fields. Return explicit truncation metadata
  rather than silently losing content.

## Pagination and freshness

- Load an initial bounded page and fetch more on explicit/infinite-scroll demand
  without loading the entire graph.
- Bind cursors to a snapshot token/current `HEAD`. If history changes during
  pagination, reject stale continuation and refresh predictably rather than
  duplicating or skipping entries.
- Cancel or ignore superseded requests and isolate results per task-012 project
  session.
- Avoid one Git process per row. Published/local reachability, decorations, and
  summaries must be derived in bounded batch operations.

## Version details

- Selecting a saved version opens a detail region that shows:
  - complete bounded description and technical metadata;
  - parent relationship;
  - changed-file list and counts by category;
  - a readable patch using the established task-009 diff language.
- Compare a normal commit to its first parent. Compare the first/root commit to
  Git's empty tree. For merge commits, label the first-parent comparison
  explicitly and show all parent IDs in technical details.
- Handle binary, too-large, no-text-difference, malformed, and truncated diffs
  using the existing typed patterns rather than a second diff renderer.
- Cache bounded pages/details per session and invalidate them after save,
  publish, get-team-changes, branch change, or repository refresh.

## UI and interaction

- Enable **History** navigation only when the screen is functional.
- Use a compact timeline/list plus detail layout consistent with Changes:
  readable high-density rows on opaque surfaces, with one selected item.
- Lead each row with the saved description. Author, relative/absolute date,
  merge/root state, publication state, and short ID are secondary.
- Do not render a decorative graph that implies branch topology the MVP does
  not model accurately.
- Provide empty/loading/error states for:
  - first project with no saved versions;
  - detached `HEAD`;
  - shallow history;
  - missing/unreadable commits;
  - stale page;
  - no upstream/publication state unknown;
  - selected version no longer reachable after refresh.
- Preserve selected version and scroll position per project when switching.
- Provide list/detail keyboard navigation, visible focus, screen-reader
  selection semantics, localized dates, and non-color publication indicators.

# Out of scope

- Full multi-branch commit graph visualization.
- Search, filtering, author avatars, Gravatar, or network identity lookup.
- Comparing two arbitrary saved versions.
- Restore, revert, reset, checkout, cherry-pick, amend, rebase, or branch
  creation.
- Editing commit messages or metadata.
- Signature verification UI.
- Reflog and unreachable commit browsing.
- File history/blame.

# Acceptance criteria

- [ ] The History navigation opens a real, read-only timeline for the active
      project.
- [ ] Normal, root, and merge commits parse through delimiter-safe typed output.
- [ ] Pagination is bounded and stale cursors cannot duplicate/miss entries
      silently after history changes.
- [ ] Rows show understandable description/date/author information with exact
      hashes and refs available progressively.
- [ ] Local-only, published, and unknown states are accurate relative to the
      configured upstream and never inferred from a hosting provider.
- [ ] Version details reuse the established diff states and explain first-parent
      merge comparison.
- [ ] Large histories, long messages, many decorations, binary/large patches,
      shallow repositories, and non-ASCII data remain responsive and truthful.
- [ ] No history command mutates refs, index, worktree, configuration, or
      remotes.
- [ ] History cache/selection invalidates correctly after save, publish,
      get-team-changes, branch change, and project close.
- [ ] Per-project selection, pagination, loading, and errors remain isolated
      when switching sessions.
- [ ] Spanish/English copy, localized dates, keyboard, focus, screen reader,
      narrow/large layouts, light/dark themes, and reduced motion are complete.

# Required tests and audit

## Rust unit tests

- Delimiter-safe parsing with multiline, empty, control-character, and
  non-ASCII messages/identities.
- Root, normal, and multi-parent merge commits.
- Decoration parsing without ambiguous comma/string splitting.
- Truncation and page-size limits.
- Published/local/unknown reachability classification.
- Cursor/snapshot validation and stale-history outcomes.

## Rust integration tests

Use temporary repositories for:

- unborn, single-commit, linear, merged, tagged, detached, and shallow history;
- local-only, fully published, and partly published timelines;
- history changing between pages;
- large commit counts and large messages;
- rename, deletion, binary, too-large, root, and merge detail diffs;
- no mutation of refs, index, worktree, config, or remote-tracking state.

## Frontend and desktop audit

- Empty, loading, populated, loading-more, stale, partial-error, and detail
  states.
- 1, 50, hundreds, and thousands of versions with bounded DOM/render work.
- Long/duplicate descriptions, many refs, time zones, locale changes, and
  non-ASCII content.
- Switch projects during page/detail requests and after selection.
- Keyboard list/detail flow, focus restoration, screen-reader semantics,
  light/dark, narrow/large windows, and reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `work/done/009-changes-and-diff-viewer.md`
- `work/active/010-save-version.md`
- `work/done/011-publish-changes.md`
- `work/done/012-open-and-switch-projects.md`
- `work/active/013-check-team-changes.md`
- `src/main.tsx`
- `src/changes.tsx`
- `src/repositoryOverview.ts`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- **Unblocked 2026-08-10.** Epic 022 and its task-031 audit landed. History is
  the first real greenfield screen and consumes the proven modular feature,
  session-epoch, native-execution, typed-invalidation and performance-safe
  screen contracts rather than adding responsibilities to `main.tsx`/`lib.rs`.
  Task 031 built and removed a History-shaped proof of exactly this path;
  follow the measured footprint table in
  `docs/architecture/frontend-feature-guide.md` §8 and expect no edit outside
  it. One known gap: refreshing on watcher invalidation still requires adding
  the controller to `createRepositoryReadCoordinator` by hand.
- Task 010 for the save-version vocabulary and result.
- Task 012 for per-project history continuity and request isolation.
- Tasks 011/013 for optional published/local reachability. The timeline must
  still work with publication state marked unknown when no upstream exists.

# Decisions

- Start with the active branch's reachable history, not a full repository graph.
- Preserve merge commits but visualize them as rows, not a misleading graph.
- Use bounded snapshot-aware pagination and batch Git reads.
- Commit details reuse task 009's diff language and typed exceptional states.
- History remains entirely read-only.

# Implementation notes

Complete during implementation. Record the log format, pagination cursor,
snapshot invalidation, upstream-boundary algorithm, caching limits, and detail
diff reuse.

# Validation

Record exact frontend, Rust, large-history, desktop, accessibility, and
cross-platform checks.
