# GitOdrile backlog

This file is an inbox for ideas that are not approved for implementation. The
dependency-ordered `1.0.0` scope lives in [`docs/ROADMAP.md`](../docs/ROADMAP.md)
and [`work/active/release-1.0/`](active/release-1.0/). Promote one idea into a
scoped task before coding it.

## Likely after `1.0.0`

### Changes and saved versions

- Select individual hunks or lines for save/discard while preserving the real
  index and providing recovery for discarded content.
- Compare two saved versions or two version lines.
- Restore one file from a saved version without moving the active version line.
- Create a version line from an earlier saved version.
- Add file history and blame only if they can be presented without crowding the
  default History experience.

### Version lines and parallel work

- Rename a local version line with remote/upstream consequences explained.
- Add linked-worktree creation, switching, renaming, and deletion as a deliberate
  parallel-work model; do not conflate worktrees with ordinary branches.
- Evaluate tags/releases against a validated release-management user outcome.

### Advanced history operations

- Amend the latest saved version.
- Cherry-pick one or more saved versions.
- Rebase a version line, including continue/skip/abort and conflict variants.
- Squash or reorder unpublished saved versions.
- Design an exceptional force-publish workflow with remote protection checks,
  explicit teammate impact, lease semantics, and durable recovery evidence.

These actions rewrite or synthesize history and need separate plans; they are
not implied by the `1.0.0` merge and restore workflows.

### Hosting and collaboration

- Provider-neutral account/authentication contracts beyond system Git helpers.
- GitHub authentication, repository browsing, hosted-repository creation, forks,
  pull requests, checks, issues, and branch-protection/ruleset details.
- Additional hosting-provider integrations selected by user demand.
- Pull-request review only after local diff/history/conflict workflows are
  mature; do not turn the first release into a hosting dashboard.

### Desktop integrations

- Configure and open a default external editor, file manager, and terminal with
  platform-specific argument validation.
- Drag-and-drop opening of one or multiple local projects.
- OS-native recent-project and file-association integrations.

### Settings

- Answer the global half of `get_line_endings` without taking a repository read
  permit. The command is declared `read(...)`, so opening Settings while a save,
  publish or sync holds the write permit makes it wait for that write to finish
  — the one worst case task 069 did not remove. The global value is true
  regardless of what the repository is doing, so it could be answered
  immediately and the project's override filled in once the permit frees.
  Deferred because changing the concurrency policy of a repository read is worth
  more care than the case is worth.

## Product and quality research

- Explain repository health in plain language with actionable, bounded checks.
- Detect changes caused only by line-ending normalization.
- Add privacy-safe application logging and a user-controlled diagnostic bundle.
- Continue large-repository benchmarks beyond the `1.0.0` gate, including:
  - thousands of changes through status, IPC, virtualization, diffs, selection,
    save planning, watcher invalidation, and cancellation;
  - `reaching_refs_by_commit` memory/CPU with many branches and commits;
  - temporary-index cost when planning a new version line in a large worktree.
- Research background refresh intervals only after watcher/large-repository
  measurements justify them. Visibility alone must never trigger network work.
- Extend accessibility audits to additional assistive technologies and desktop
  environments after the release matrix is established.

## Later hypotheses

- Optional local commit-message suggestions.
- Optional AI explanations, conflict assistance, and repository health guidance
  with explicit consent and exact transmitted-data disclosure.
- Team safety policies and educational modes.
- Extension/plugin model after stable internal contracts and real third-party
  use cases exist.
- Optional collaboration or paid features that never weaken the account-free
  local Git workflow.

## Explicitly not an automatic priority

- Matching every GitHub Desktop, GitKraken, Fork, Tower, or GitButler command.
- A decorative full commit graph before a user problem requires topology.
- Mandatory accounts, autonomous repository mutations, silent conflict
  resolution, automatic stashing, or cloud storage of local repository data.
