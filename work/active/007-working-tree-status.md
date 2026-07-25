---
id: 007
title: Read and explain the working-tree status
status: active
priority: high
type: feature
areas:
  - rust
  - frontend
created: 2026-07-25
completed:
---

# Goal

Produce a typed, plain-language summary of what has changed in the opened
project's working tree, and surface it as the Overview's primary status.

# User outcome

After opening a project, a user can tell at a glance whether they have unsaved
work, how much of it there is, and whether anything needs attention — without
running `git status` or knowing what "staged" means.

# Context

Task 001 deliberately shipped an Overview that refuses to state a pending-change
count, because no typed working-tree result existed. Its primary card therefore
communicates readiness and offers "Open another project", with "Review changes"
rendered disabled. That is honest but thin: the strongest surface in the app
carries the least information.

This task provides the missing data. It is the highest-leverage Fase 1 item in
[`docs/ROADMAP.md`](../../docs/ROADMAP.md) because it unblocks the Overview's
primary card, the Changes navigation entry, and — later — the save-version flow,
which cannot exist without knowing what would be saved.

`open_repository` in `src-tauri/src/lib.rs` established the patterns to reuse:
run `git` without a shell, canonicalize and validate paths in Rust, return a
typed `{ code, message, remediation }` error, and keep parsing out of React.
`docs/ARCHITECTURE.md` additionally requires machine-readable Git output with
parser fixtures, which `--porcelain=v2` provides and the human-readable
`git status` does not.

The plain-language mapping matters as much as the parsing. `DESIGN.md` asks for
outcome-shaped copy ("You have 3 files with unsaved changes"), and the product
hides the staging model behind the save-version flow rather than exposing an
index/working-tree split as the primary concept.

# Scope

- Add a Rust command that reads the working-tree status of an opened repository
  and returns a typed result.
- Parse `git status --porcelain=v2 --branch --untracked-files=all
  --renames -z` rather than human-readable output.
- Classify each entry into product categories: changed, new, deleted, renamed,
  and conflicted.
- Return per-file entries with a repository-relative path and its category,
  plus aggregate counts, so the Overview can summarize without holding the list.
- Represent "nothing has changed" as an explicit clean state rather than an
  empty list the frontend has to interpret.
- Return the upstream-tracking fields that `--branch` already provides as typed
  data, without presenting them yet (see Out of scope).
- Replace the Overview's primary card with a real working-tree summary: a
  plain-language headline, a truthful count, and clean/dirty/conflicted
  variants, keeping the loading and error variants added in task 001.
- Refresh the status when the project is opened and when the user explicitly
  asks, with a visible, keyboard-reachable refresh control.
- Cover the parser with fixtures and the command with temporary-repository
  tests.
- Localize all new copy in English and Spanish, including pluralization.

# Out of scope

- The Changes screen itself: the file list and diff viewer are their own task.
  This task may enable navigation to it only if that screen exists; otherwise
  the entry stays disabled.
- Staging and unstaging.
- Creating saved versions.
- Presenting ahead/behind or any remote state in the interface. The upstream
  fields are captured as data only; explaining them belongs to the Fase 2 remote
  work, which must distinguish "files have local changes" from "saved versions
  are up to date with the remote".
- Fetching from a remote.
- Continuous background refresh and filesystem watching. `work/backlog.md`
  requires designing watching, cancellation, and large-repository performance
  tests first; this task refreshes on open and on demand only.
- Ignored-file browsing. Ignored files are excluded from the summary.
- Line-ending-only change detection.

# Acceptance criteria

- [ ] A Tauri command returns a typed working-tree status for an opened
      repository, with Git execution and parsing in Rust.
- [ ] Parsing uses `--porcelain=v2` with `-z`, so paths containing spaces,
      quotes, non-ASCII characters, or newlines survive intact.
- [ ] Changed, new, deleted, renamed, and conflicted entries are each
      classified correctly, and renames retain both paths.
- [ ] A repository with no changes reports an explicit clean state.
- [ ] An unborn branch reports its status without error.
- [ ] A detached HEAD reports its status without claiming a branch.
- [ ] A linked worktree reports its own working tree, not the main checkout's.
- [ ] Failures — Git missing, the repository disappearing, a command failing —
      return the structured `{ code, message, remediation }` contract and are
      localized in the interface.
- [ ] The Overview's primary card states the real number of changed files in
      plain language, with correct singular and plural forms in both languages,
      and never displays a count that was not derived from a typed result.
- [ ] The clean state reads as a positive, finished state rather than an empty
      one.
- [ ] Conflicted files are surfaced distinctly and are not counted as ordinary
      changes.
- [ ] Refreshing exposes a busy state, does not clear the previously known
      status while loading, and announces a material change accessibly without
      stealing focus.
- [ ] State is never conveyed by color or icon alone.
- [ ] The status is not requested when no project is open.
- [ ] Parser unit tests cover clean, staged-only, unstaged-only, mixed,
      untracked, renamed, deleted, conflicted, unborn, and detached fixtures.
- [ ] Temporary-repository tests cover a clean repository, a repository with
      changes, an unborn branch, and a linked worktree.
- [ ] A repository with a large number of changed files renders without
      freezing the interface, and the summary remains readable.
- [ ] The required frontend and Rust checks pass.
- [ ] New copy is complete in English and Spanish.
- [ ] The Overview remains usable at approximately 1024px, at 200% text zoom,
      and in both themes with the new card.
- [ ] The new state has been verified in the real desktop app against a clean
      repository, a repository with mixed changes, and a conflicted repository.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/done/001-open-local-repository.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/i18n.tsx`

# Dependencies

- Task 001 (done) provides the opened-project contract and the Overview card
  this task fills in.
- System Git remains the Git implementation.

# Decisions

- Parse `--porcelain=v2`, not `--porcelain=v1` or human-readable output.
  v2 reports rename scores, submodule state, and the branch header in a stable
  documented format, and `docs/ARCHITECTURE.md` already requires
  machine-readable formats with fixtures.
- Use `-z` for NUL-separated records. This is the only reliable way to handle
  paths containing spaces or newlines, which the quoted default format escapes
  ambiguously.
- Return per-file entries even though this task only renders aggregate counts.
  The Changes screen needs them immediately afterwards, and returning them now
  avoids designing a second command with a different shape. If a very large
  status turns out to be a payload problem, cap the returned list and keep the
  counts exact rather than truncating the counts.
- Do not model staged/unstaged as the primary product concept. Classify by what
  happened to the file; the save-version flow owns the index.
- Capture upstream fields now but present nothing. Reading them costs nothing
  extra with `--branch`, while explaining them requires the remote contracts
  from Fase 2.
- Refresh on open and on demand only. Background watching is explicitly
  deferred in `work/backlog.md` until its performance and cancellation design
  exists, and an on-demand control matches the pattern established by
  `work/done/005-on-demand-git-updates.md`.

# Implementation notes

Complete this section during implementation.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.
