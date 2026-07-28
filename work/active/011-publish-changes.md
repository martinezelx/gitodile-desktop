---
id: "011"
title: "Publish saved versions safely"
status: active
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
created: 2026-07-27
---

# 011 — Publish saved versions safely

## Goal

Let the user publish local saved versions to a remote project through a
previewed, explicit, non-force Git push.

Publishing sends commits, not unsaved working files. The UI must preserve that
distinction even when both exist at the same time.

## User value

A user can understand:

- how many saved versions are waiting to be published;
- where they will be sent;
- whether remote tracking will be created;
- which unsaved files will remain local;
- why publishing is blocked if newer or divergent remote work exists.

## Scope

### Entry points

Support the same publish planner and confirmation from:

- **Publish now** after task 010 successfully saves a version;
- **Publish changes** in the project overview when typed status reports local
  saved versions that are not yet published.

Do not show a working publish action until the supporting planner and safety
checks are implemented.

### Remote discovery and preflight

Add typed sync-domain discovery for:

- configured remotes, with credentials redacted from display values;
- current branch and configured upstream;
- local and remote commit identifiers;
- ahead, behind, and diverged counts/state;
- optional provider hints used only for presentation.

Before producing a final plan, perform a fresh on-demand fetch/preflight for the
selected remote and relevant refs. This must update remote knowledge only; it
must not merge, rebase, checkout, reset, or modify working files.

Remote selection rules:

- use the configured upstream by default;
- with no upstream and exactly one remote, propose that remote and the current
  branch as the destination;
- with multiple possible remotes, require an explicit user choice;
- never assume a remote is named `origin` or hosted by GitHub.

### Planning contract

Return a typed `PublishPlan` containing at least:

- operation kind: `remote-mutation`;
- plain-language summary;
- ordered steps;
- risks and recovery information;
- `requiresConfirmation: true`;
- state token for local and freshly observed remote state;
- selected remote;
- local branch and destination branch;
- whether upstream tracking will be created;
- count and summary of commits to publish;
- whether unsaved files exist and are explicitly excluded.

The confirmation must show:

- the number of saved versions being published;
- remote and destination branch;
- whether tracking will be created;
- that unsaved files are not included;
- that teammates may observe the published history.

### Execution contract

Return a typed `PublishResult` containing at least:

- remote;
- local and destination branch;
- previous remote commit, when one existed;
- published commit;
- published version count;
- whether upstream tracking was created.

Execution must:

- revalidate the plan token immediately before push;
- push exactly one confirmed branch/refspec;
- invoke Git with separate arguments and machine-readable output where
  available;
- use normal system Git credential helpers and hooks;
- create upstream tracking only when shown in and accepted with the plan;
- never force push, delete refs, mirror, or publish tags implicitly;
- never mutate the index or working tree;
- refresh overview/status after success.

### Blocked and failure states

Return structured, actionable outcomes for:

- no remote configured;
- detached `HEAD`;
- unborn branch with no saved version;
- nothing waiting to publish;
- local branch behind the destination;
- diverged local and remote histories;
- remote state changing after preview;
- invalid or unsafe ref names;
- authentication or authorization failure;
- network failure or timeout;
- remote rejection, including server-side hooks;
- cancellation or an uncertain outcome.

A non-fast-forward result must direct the user toward the future **Get team
changes** flow. Do not automatically merge, rebase, resolve conflicts, or retry
with force.

Publishing may proceed while unsaved files exist only when the plan explicitly
says those files stay local and tests prove the worktree and index remain
unchanged.

Cancellation must avoid claiming failure when the remote outcome cannot be
known. Refresh remote state before offering a retry after an uncertain result.

## Safety model

This is a **remote mutation**. It requires:

1. fresh remote knowledge;
2. a preview with destination and consequences;
3. explicit user confirmation;
4. execution constrained to the confirmed branch and refspec;
5. a result refresh that verifies the observed outcome.

Recovery information should identify the previous remote commit when available,
but the UI must not promise automated rollback in this task.

## States and UX copy

Cover at least:

- versions ready to publish;
- first publish and upstream creation;
- already published;
- no remote;
- remote selection required;
- behind;
- diverged;
- unsaved files excluded;
- authentication required/failed;
- offline, timeout, and remote rejection;
- stale plan;
- publishing progress;
- cancellation with known or uncertain outcome;
- successful publish.

Use **Publish changes** as the primary wording and **push** only as secondary
educational detail where useful.

## Acceptance criteria

- [x] Both entry points use one shared publish planner and confirmation flow.
- [x] Remote discovery returns redacted, structured data.
- [x] The plan is based on a fresh remote preflight and is classified as a
      remote mutation requiring confirmation.
- [x] The confirmation identifies commit count, remote, destination, tracking
      creation, teammate impact, and excluded unsaved files.
- [x] Configured upstream selection works without assuming `origin`.
- [x] A single remote can be proposed for first publish; multiple remotes
      require explicit selection.
- [x] Execution revalidates local and remote state.
- [x] First publish can create the confirmed upstream relationship.
- [x] Normal ahead-only publication succeeds.
- [x] Up-to-date, behind, diverged, detached, unborn, and no-remote states are
      handled without unsafe mutation.
- [x] Non-fast-forward results never trigger force push or automatic
      integration.
- [x] Authentication, network, timeout, hook, rejection, cancellation, and
      uncertain outcomes are accurately represented.
- [x] Unsaved files and the index remain unchanged on success and failure.
- [x] No tags, extra branches, or unintended refs are published.
- [x] Success refreshes the overview and accurately reports the published
      destination and version count.
- [x] Keyboard navigation, focus, loading, error, and reduced-motion behavior
      are verified.
- [x] Spanish and English copy is complete and understandable without Git
      expertise.

## Required tests

### Rust unit tests

- Remote URL credential redaction.
- Upstream and remote-selection rules.
- Ahead/behind/diverged classification.
- Ref validation and explicit refspec construction.
- Plan-token stability and invalidation.
- Porcelain push-result and failure parsing.

### Rust integration tests

Use local bare remotes to cover:

- first publish with upstream creation;
- ahead-only publish;
- already up to date;
- behind remote;
- diverged history;
- remote changed after planning;
- remote hook rejection;
- publication with unsaved files present;
- unchanged working tree and index on every result;
- exactly one intended branch updated.

Network and credential-specific cases may use deterministic process fixtures
where a hermetic real integration is not practical.

### Frontend tests and manual verification

- Overview and post-save entry points.
- Remote choice and upstream-creation confirmation.
- All blocked, loading, error, uncertain, and success states.
- Clear treatment of unsaved files as excluded.
- Keyboard-only completion and focus restoration.
- Live desktop verification in light and dark themes.

## Out of scope

- Force push in any form.
- Remote branch or tag deletion.
- Publishing tags, all branches, or mirrored refs.
- Pulling, merging, rebasing, or conflict resolution.
- The **Get team changes** implementation.
- Built-in hosting-provider authentication.
- Clone, fork, or remote-repository creation.
- Pull request creation or review.
- Multi-branch batch publication.
- Background or automatic publishing.
- Direct publication of unsaved files.

## Platform implications

- Use the system Git credential-helper behavior on Windows, macOS, and Linux.
- Treat credential prompts, cancellation, timeouts, and process termination as
  distinct outcomes where possible.
- Support HTTPS, SSH, local-path, and file-based remotes without exposing
  embedded credentials.
- Preserve non-ASCII branch and remote names while validating refs safely.
- Keep integration tests hermetic with local bare repositories.

## Dependencies

- Task 010 for the post-save **Publish now** integration.
- Existing repository overview/status architecture.
- System Git and the user's configured credential helpers.

## Validation

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 7 test files / 57 tests (including 12 new
  `publishDialog.test.tsx` tests and the updated `saveVersionDialog.test.tsx`/
  `changesPanel.test.tsx` for the new `onPublishNow` prop).
- `pnpm run build` — pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 112 tests (91
  pre-existing + 21 new: redaction, remote-selection rules, state-token
  stability, push-failure classification as unit tests; first publish with
  upstream creation, ahead-only, already up to date, behind, diverged,
  remote changed after planning (stale token), remote hook rejection,
  unsaved-files-present with byte-identical index, and exactly-one-branch-
  updated as integration tests against real local bare remotes).
- **Not performed: live desktop verification.** This environment can only
  drive a Chromium-based browser preview, not the actual Tauri desktop
  window (`invoke` has no IPC bridge outside the real Tauri shell, and
  `pnpm run dev` alone only serves the frontend). The light/dark theme,
  real-credential-helper, and true end-to-end publish flow described in
  "Required tests > Frontend tests and manual verification" have **not**
  been visually confirmed by me. Recommend running `pnpm tauri dev` locally
  before treating this as fully shippable. This task file is intentionally
  left in `work/active/`, not moved to `work/done/`, until that check
  happens.

## Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/active/010-save-version.md`
- `work/done/007-working-tree-status.md`
- `work/done/009-changes-and-diff-viewer.md`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/changes.tsx`
- `src/saveVersionDialog.tsx`
- `src/publish.ts`
- `src/publishDialog.tsx`
- `src/appError.ts`
- `src/i18n.tsx`
- `src-tauri/src/lib.rs`

## Implementation notes

- Follows the exact save-version split: a read-only planning half
  (`discover_remotes`, `plan_publish`) and a narrow execution half
  (`publish`), sharing one `validate_and_prepare_publish` core so each
  command spawns Git exactly once for its own fresh preflight. Unlike
  save-version, `plan_publish` and `publish` each run their *own*
  independent fetch — time passes while the user reads the confirmation, so
  the whole point of "revalidate immediately before push" requires a second,
  separate fetch rather than reusing the plan's.
- `run_git_networked` is a new timeout/kill primitive for `fetch`/`push`
  (the only network-touching Git calls) — nothing else in the codebase had
  one; it follows the same spawn → poll `try_wait` → kill-on-timeout shape
  as the existing Windows-only winget update-check loop, generalized to run
  on every platform. `GIT_TERMINAL_PROMPT=0` makes a missing credential
  helper fail fast instead of hanging on a terminal prompt a GUI app could
  never answer; real credential helpers and SSH agents are unaffected.
- Ahead/behind/diverged is computed via `git rev-list --left-right --count
  local...remote` after the fresh fetch; a first publish (no remote ref yet)
  is detected by pattern-matching `fetch`'s "couldn't find remote ref"
  stderr rather than treating it as an error.
- Remote URLs are redacted (`user:pass@`/token-in-URL stripped) before ever
  leaving Rust; SSH's `user@host:path` shorthand is left untouched.
- Cancellation is scoped down to timeout-driven "uncertain outcome"
  handling (`PublishUncertain`), not an interactive mid-push cancel button —
  the codebase has no async-cancellation precedent, and save-version's own
  `submitting` state offers no mid-flight cancel either.
- The Overview's **Publish changes** entry point is a cheap, cached-status
  heuristic (`workingTree.upstream`, no network call): hidden only when
  affirmatively known there's nothing to publish (upstream configured and
  ahead is 0); shown otherwise, including "no upstream configured yet".
  `plan_publish`'s own `NothingToPublish` blocked state covers the rare
  false positive. Confirmed with the user before implementing.
- `SaveVersionDialog`'s previously-disabled **Publish now** placeholder
  (and its now-inaccurate `saveVersionPublishComingSoon` copy, removed) is
  now a real button via a new required `onPublishNow` prop; both entry
  points open the same lifted `PublishDialog` instance owned by `App` in
  `main.tsx`.

