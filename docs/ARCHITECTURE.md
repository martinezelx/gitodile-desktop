# Architecture

This document describes the architecture that new code must follow. Decision
rationale lives in [`docs/adr/`](adr/); task files and numbered architecture
records are historical evidence, not the current specification.

## System shape

GitOdrile is a modular desktop application with a React/TypeScript frontend in
a Tauri shell and Rust services for Git, filesystem, process, session, and
platform-sensitive behavior.

```text
React feature UI
  -> controller + typed port
    -> feature-owned Tauri adapter
      -> ipc.rs transport adapter
        -> application.rs policy/authorization
          -> product domain
            -> git_command.rs / git.rs / filesystem / watcher
```

The important property is dependency direction: presentation depends inward
on feature contracts; domain behavior does not depend outward on React, Tauri,
or transport types.

## Frontend ownership

The frontend is a modular monolith:

```text
src/
  bootstrap.tsx             # mounts React and reveals the native window
  main.tsx                  # composition root and cross-feature orchestration
  screens.tsx               # single screen registry and keep-alive host
  screenModule.tsx          # neutral screen/lifecycle contracts
  projectRuntime.ts         # project-scoped immutable store/selectors
  projectSessions.ts        # session state and persistence shape
  app/                      # shell UI, overlays, preferences, branding, copy
  features/<feature>/       # product owner
  shared/ui/                # proven multi-consumer primitives
  shared/i18n/              # shared copy/error localization
  styles/                   # tokens and base rules
```

A feature owns, as applicable:

- domain types and equality rules;
- controller, request generations, caching, and eviction policy;
- typed port and `tauriAdapter.ts`;
- screen descriptor, UI, translations, styles, and tests;
- an explicit `index.ts` public API.

Features may import neutral runtime contracts and another feature's public
`index.ts`; they may not import another feature's internals or app composition.
Only a feature's `tauriAdapter.ts` may import `@tauri-apps/api`. Visual
components receive data and callbacks and never name IPC commands.

Cross-feature orchestration belongs at the composition root. A reusable
primitive moves into `shared/` only after it has multiple real consumers and a
stable, domain-neutral contract.

### Screens and lifecycle

Every screen is registered once in `src/screens.tsx`. The descriptor drives
navigation, command-palette entries, project guards, chunk prefetching,
keep-alive mounting, accessibility behavior, and optional performance budgets.
Do not wire any of those separately in `main.tsx`.

Overview is eager because it owns first paint. Other functional screens use
`createLazyScreenContainer`; the same loader promise serves lazy mounting and
primary preloading. Overlay panels stay eager: an overlay opens from a click
with no navigation in front of it, and `React.lazy` suspends on first render
even when its module is already warmed, so code-splitting one buys a fallback
frame no prefetch can remove.

Visited project screens remain mounted for the active project epoch:

- `active`: subscriptions and active-only effects may run;
- `hidden`: DOM/local UI state is retained, but the subtree is `hidden`,
  `inert`, unsubscribed from project selectors, and silent;
- `evicted`: the screen unmounts when its project epoch closes or changes.

Use `useActiveProjectSelector` and `useActiveScreenEffect` inside screens.
Visibility is not freshness: never fetch, poll, or warm a cache merely because
a screen became visible.

The complete implementation recipe is in the
[`frontend feature guide`](architecture/frontend-feature-guide.md). Version
lines remains a concrete
[`reference slice`](architecture/version-lines-reference-slice.md).

### Project state and freshness

Each open project owns a `ProjectRuntime` with an immutable reducer snapshot
and a distinct session epoch. The canonical worktree path identifies a
project; the epoch identifies one open incarnation. Responses and watcher
events must match both so work started before close cannot populate a reopened
project.

Runtime instances are passed explicitly. There is no ambient current-project
store. Selectors are narrow and preserve identity when their selected value is
unchanged.

Repository data refreshes only from these owners:

- project activation;
- explicit refresh;
- successful mutation;
- typed repository invalidation.

`RepositoryReadSubscriber` registrations let features join invalidation
fan-out without Repository importing them. Cache warming is separate,
idle-deferred, cancellable, and limited to `project-activation` or
`repository-invalidation` reasons. Background work never precedes first paint.

Status owns working-tree and unpublished-version snapshots. Changes owns
epoch-scoped diff caches, capped at four epochs and 256 diffs / approximately
40 MiB per epoch. Lists that grow with repository size stay virtualized; the
native 1,000-entry payload cap is not a DOM strategy.

### Styles and translations

`src/styles.css` is the eager cascade manifest: tokens, base, theme transition,
shell, shared primitives, then feature styles. Feature CSS stays beside its
owner but is not lazy-imported, preventing an unstyled first feature frame.
Document-root choreography that no single component owns — the view-transition
pseudo-elements behind a theme change — sits in `styles/`, not in the sheet of
whichever control happens to trigger it.

English and Spanish dictionaries stay beside their owner and are composed in
`src/i18n.tsx`. Exact typed locale objects make missing, extra, or incompatible
keys a compile-time error. Shared errors/actions belong in `shared/i18n`; shell
copy belongs in `app/translations.ts`.

## Rust ownership

The Rust side uses flat modules until a module genuinely needs internal
submodules:

```text
src-tauri/src/
  lib.rs                  # Tauri builder, plugins, state, handler registration
  ipc.rs                  # argument extraction, session checks, serialization
  application.rs          # execution-policy inventory and authorization entry
  repository_access.rs    # RepositoryContext + fair commonGitDir coordinator
  git_command.rs          # policy-aware domain-facing Git facade
  git.rs                  # bounded process execution and cancellation
  error.rs                # stable structured application errors
  operation.rs            # shared operation kind and safe diagnostic details
  index.rs                # collision-safe temporary-index preparation
  session.rs              # opaque project epochs
  watch.rs                # filtered/debounced typed invalidation
  desktop.rs              # desktop-shell services
  tooling.rs              # Git diagnostics, install/update, identity, line endings
  repository.rs
  clone.rs                # staged provider-neutral acquisition and verification
  initialize.rs           # local-project planning, ownership, and initialization
  platform.rs             # exclusive no-replace directory publication
  status.rs
  changes.rs
  history.rs              # bounded read-only saved-version timeline/details
  recovery.rs             # persistent discard snapshots and safe restore
  save_version.rs
  publish.rs
  sync.rs                  # remotes, upstreams, fetch and relation knowledge
  version_lines.rs        # product domains
  test_support.rs         # shared hermetic Git-repository test fixtures
  tests/<domain>_tests.rs # cross-module integration tests grouped by owner
```

The production body of `lib.rs` contains registration only. `ipc.rs` names the
modules it adapts and delegates immediately. Product domains may depend inward on application,
repository access, Git-command, and shared error contracts; they may not depend
on `ipc`, `watch`, or Tauri. Integration tests live under `src/tests/`, grouped
by the product domain whose behavior they verify; reusable repository fixtures
live in `test_support.rs`, never in the crate composition root.

### Repository identity and access

Never assume the selected folder is the repository root. `RepositoryContext`
retains separate identities for:

- worktree root;
- Git directory;
- common Git directory;
- bare/non-bare state;
- backend path and normalized comparison key.

Windows verbatim and ordinary paths compare together while Git receives a
normal path. macOS selected aliases such as `/var` are retained beside their
canonical spelling so watcher events match either form.

The access coordinator is keyed by canonical common Git directory. Reads may
overlap; mutations are exclusive; a queued writer blocks later readers. Linked
worktrees therefore share mutation exclusion while unrelated projects remain
independent. Lock re-entry is rejected; an authorized nested read inherits its
existing permit.

### Repository acquisition

Cloning is an acquisition workflow owned by `clone.rs`, separate from opening
an existing project and from provider-specific integrations. The frontend
`features/clone` owner supplies an eager dialog, attempt-generation controller,
typed port, and Tauri adapter; only `main.tsx` hands a verified destination to
the existing repository/session lifecycle.

Rust accepts HTTPS, SSH (including scp-like syntax), Git, file URLs, and local
paths. It strips URL user-info, queries, and fragments before Git invocation,
remote persistence, diagnostics, or IPC-safe display. A plan binds the
normalized source and exact absent destination with a state token. Execution
creates `.gitodrile-clone-<operation-id>` under the selected parent, writes an
exact ownership marker, clones without recursive submodules, sanitizes
`origin`, verifies repository identity and worktree usability, and publishes
the `project` child with an OS-specific exclusive no-replace rename. It then
verifies the final path before the composition root may open it.

Cancellation belongs to the exact clone operation rather than to a project
epoch, because no project session exists yet. Frontend generations make late
results inert; Rust kills the bounded Git process and removes only a staging
directory whose exact path, type, name, and ownership marker all match. An
existing destination is never cleanup-eligible. `platform.rs` provides the
Windows `MoveFileExW`, Linux `renameat2(RENAME_NOREPLACE)`, and macOS
`renamex_np(RENAME_EXCL)` publication boundary.

Local creation is a separate acquisition workflow owned by `initialize.rs` and
`features/initialize-project`. Its eager dialog has typed ports and an
attempt-generation controller; only the composition root passes a verified
result into the existing open/session lifecycle. A plan canonicalizes the
parent or existing folder, validates the project and initial version-line
names, rejects case/alias collisions, enclosing or descendant repositories,
linked worktrees and existing `.git` metadata, and snapshots the exact path and
README state. Execution repeats that inspection immediately before mutation.

For a new project, execution exclusively creates the requested absent child;
for an existing ordinary folder it creates only an absent `.git` directory.
Both owned paths receive an operation-specific marker before `git init`, and
the result is accepted only after repository-root, initial-branch, and unborn
state verification. Optional README creation uses create-new semantics. Cleanup
may remove only an exact, operation-marked directory that is still empty apart
from its marker; user files, populated Git metadata, and all pre-existing paths
are never cleanup-eligible. Optional first-save work happens after opening and
reuses the normal identity, hook, signing, temporary-index, and stale-session
contracts.

Connecting a remote is a distinct local configuration mutation in `sync.rs`,
with its own preview and state token. It validates the exact remote name and a
provider-neutral HTTPS, SSH, Git, file, or scp-like URL, removes credentials,
queries, and fragments before IPC or persistence, snapshots the current remote
configuration, and revalidates under exclusive repository access. The action
uses `git remote add`, never contacts the network, never replaces existing
configuration, and verifies the stored fetch/push URL before reporting success.
Later checking and publishing continue through the existing sync flows.

### Execution policies and Git processes

Every registered command has exactly one checked `ExecutionPolicy` defining:

- operation class;
- stdout/stderr caps;
- timeout and cancellation behavior;
- prompt behavior;
- concurrency class.

There is no fallback policy. A production Git call without an application
frame returns a structured failure; debug/test builds panic so the programming
error is visible.

All Git launches use argument vectors, an explicit working directory where
applicable, and deterministic locale. User input is never interpolated into a
shell string. Stdout and stderr drain concurrently and retain only their caps.
Diagnostics redact URL credentials, queries, and fragments.

Equivalent reads may cancel an older process token. Mutations never
automatically cancel one another because interruption can leave an uncertain
outcome. Windows requests descendant cleanup before killing/reaping the tracked
child; macOS/Linux currently guarantee only tracked-child cleanup. The release
hardening requirement is recorded in
[`ADR 0006`](adr/0006-defer-macos-and-linux-runtime-validation.md).

### IPC contract and invalidation

The public IPC surface is pinned in
[`025-ipc-contract.json`](architecture/025-ipc-contract.json). Rust and
TypeScript tests verify command names, arguments, responses, error codes, and
representative serialization. Intentional changes update the JSON contract and
both sides in one review.

Authorizing actions require `sessionEpoch`. Compatibility-optional epochs are
limited to explicitly non-authorizing read/watch entries; every current
feature adapter supplies the epoch.

Repository watchers emit only:

```ts
type RepositoryInvalidation = {
  projectId: string;
  sessionEpoch: string;
  sequence: number;
  kind: "worktree" | "head_or_refs" | "shared_repository";
};
```

Events are trailing-debounced for 300 ms with a two-second starvation ceiling.
Raw changed paths and repository content never cross IPC. Shared ref/config
changes fan out once to every related open worktree; objects, logs, hooks,
modules, and lock-file churn are filtered. Explicit refresh remains available
if an OS watcher cannot be established.

### Read-only saved-version history

`history.rs` owns the current-`HEAD` saved-version timeline. It is a read-only
domain service behind three narrow commands: `read_history_page`,
`read_saved_version_detail`, and `read_saved_version_file_diff`. The first
returns a bounded `HistoryPage`; the detail commands require both its snapshot
token and a still-reachable commit. All commands require the active project
session epoch and run under the repository read coordinator. They never fetch,
write configuration, move a ref, touch the index, or modify working files.

Pages follow `rev-list --topo-order --date-order --parents HEAD` and include
merge rows without pretending to render a complete branch graph. The service
uses bounded stdin-driven `cat-file --batch-check`/`--batch` reads for raw
commit objects and one NUL-framed `for-each-ref` pass for decorations. Object
lengths, not message delimiters, frame untrusted messages. Page size defaults
to 50 and is capped at 100; messages, decoration counts, Git output, changed
files, and detail diffs each have explicit limits and typed truncation states.

An opaque continuation cursor binds the offset and publication-boundary
progress to a token derived from repository identity, branch/HEAD, shallow
state, and the configured local upstream tracking ref/commit. A changed token
returns `stale_history_cursor`; the frontend restarts at the newest page rather
than appending inconsistent data. Publication state is derived only from local
reachability against that configured tracking commit. Without a usable
upstream, it is `unknown`; History never guesses from a hosting provider or
contacts the network.

Root details compare with Git's empty tree. Ordinary and merge details compare
with the first parent, and merge responses retain every parent for technical
inspection. NUL-framed changed paths and the selected comparison base feed the
existing `changes.rs` typed diff pipeline, so text, binary, too-large,
unchanged, conflict, rename, and truncation semantics have one owner.

The desktop process keeps a read-through cache of page-proven commit context.
It is bounded to four snapshots, 1,000 commits and eight sub-512 KiB details
per snapshot. A selected detail still verifies the current `HEAD`, then needs
only the bounded changed-file read; its first file diff reuses that exact list
instead of enumerating every changed path again. Cache misses use the complete
snapshot/reachability validation path, so eviction never weakens correctness.

The frontend `features/history` owner supplies the port/adapter, generation-
aware controller, lazy keep-alive screen, virtualized timeline/files, and
localized UI. It keeps at most four session caches, 5,000 loaded rows, 24
details, 64 diffs, and 20 MiB of estimated detail/diff data. Project activation
warms the first page without making screen visibility a fetch signal. Shared
repository invalidations refresh it after save, publish, get-team-changes,
version-line changes, watcher events, and explicit repository refresh; project
close evicts the epoch so late results cannot cross incarnations.

## Mutation model

User actions that change history or a remote follow plan, confirm, execute,
and verify phases. Rust revalidates repository state immediately before
execution under the repository-access coordinator.

An operation plan classifies work as read-only, local mutation, history
mutation, remote mutation, or destructive, and carries steps, risks,
confirmation requirements, and recovery information. “Destructive” is a risk
classification, never permission to discard data.

Save-version uses a unique temporary index, restores the real index byte for
byte on failure, and preserves hooks and signing. Publish does not claim
failure after an outcome may have reached the remote; it reports
`publish_uncertain`. Frontend mutation phases supersede stale generations,
coalesce watcher work, and perform one shared follow-up refresh.

Team sync separates local knowledge from explicit network freshness.
`read_team_sync_status` reads only existing remote-tracking refs under a shared
repository-read permit. `check_team_changes`, plus Publish planning/execution
preflights, fetch under an exclusive common-Git-directory permit through the
same `sync.rs` remote, redaction, fetch, and ancestry implementation. Project
activation, screen visibility, watchers, and cache warming never call the
network command.

Get-team-changes extends that single sync domain. Planning and execution each
fetch the exact configured upstream under one exclusive `commonGitDir` permit,
then require a named branch that is strictly behind with zero local-ahead
commits. The plan token binds repository identity, session epoch, branch,
local and remote commits, upstream destination/tracking ref, planned recovery
ref, and the complete porcelain-v2 local-safety snapshot. Incoming versions
are capped at 25 and file evidence at 100 while retaining authoritative totals
and truncation flags. Untracked and ignored paths are compared by complete path
components against added, modified, deleted, and renamed paths; when bounded
evidence cannot prove safety, the operation blocks.

Execution repeats the fetch and validation, creates and verifies recovery,
then runs the narrow two-tree update `git read-tree -u -m <old> <target>` and
the compare-and-swap branch move
`git update-ref refs/heads/<branch> <target> <old>`. It never calls `pull`,
merge, rebase, reset, checkout, stash, force, or conflict resolution. A failure
after recovery is conservatively returned as an uncertain local result with
the observed `HEAD` and inspection instructions. The authoritative success
snapshot is committed before exactly one coordinated local refresh; coalesced
watcher invalidations never issue a fetch.

History-mutation recovery follows
[ADR 0008](adr/0008-store-history-recovery-as-versioned-hidden-refs.md): the
previous commit is protected by a create-only ref under
`refs/gitodrile/recovery/v1/get-team-changes/`, paired with versioned metadata
in the common Git directory. The newest 20 complete records are retained per
common repository across linked worktrees, and incomplete or unsupported
evidence is never guessed at or deleted.

Discard follows the same plan/revalidate/execute/verify boundary and creates a
persistent record under the selected worktree's Git metadata before mutation.
The record preserves exact target bytes and the real index, can be restored
after restart only while its post-discard state token still matches, and is
defined by [ADR 0007](adr/0007-store-discard-recovery-in-worktree-git-metadata.md).

Never silently resolve conflicts, discard untracked files, bypass hooks or
signing, force-push, run `reset --hard`, clean files, or delete a branch without
the confirmation and recovery rules in `AGENTS.md`.

## Enforced checks

`pnpm run check` is the repository gate:

- `check:docs` validates local Markdown links, work-item state/completion
  metadata, unique task IDs, README package metadata, and application-version
  consistency across npm, Cargo, and Tauri;
- `check:architecture` analyzes production, type-only, dynamic, and test edges,
  rejects forbidden directions/cycles and eager `fileIcons`, and proves its
  rules with seeded violations;
- TypeScript strict checking, Vitest, and the production Vite build;
- `cargo fmt --check`, Clippy with warnings denied, and all Rust tests;
- Rust syntax-based tests pin module ownership, keep `lib.rs` registration-only,
  reject crate-root glob transport imports, and verify the IPC/policy inventory.

Performance comparison protocol and retained budgets live in the
[`architecture baseline`](architecture/023-performance-baseline.md). Enable
`VITE_PROFILE_SCREEN_SWITCHES=true` only while profiling; instrumentation is
absent from normal development and production builds.

## Platform and security constraints

- Repository content stays local unless the user explicitly invokes a remote
  feature.
- Tauri capabilities remain minimal; no generic command-execution endpoint is
  permitted.
- Repository content, config, hooks, remote responses, and paths are untrusted.
- Never log credentials, helper output, private keys, or authenticated remote
  URLs.
- AI features require explicit consent and disclosure of transmitted data.
- Paths, casing, symlinks, line endings, credentials, file locks, prompts, and
  process behavior across Windows/macOS/Linux are correctness concerns.

CI checks Rust on all three platforms and release-compiles macOS/Linux desktop
executables. Actual macOS/Linux WebView behavior, accessibility, memory,
signing, and packaging remain unmeasured release gates, not implied support
claims.

## When an ADR is required

Add an ADR before changing a durable decision such as the Git backend, state
management model, credential storage, updates, telemetry, AI providers, WSL
support, or extension architecture. Small ownership-preserving refactors do
not need an ADR; update this document when the current architecture changes.
