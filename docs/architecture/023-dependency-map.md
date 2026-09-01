# Task 023 dependency and responsibility map

This is the pre-migration map for epic 022. It describes production code at
commit `bce8db0` and was rechecked from the identical `src/` and
`src-tauri/src/` trees at `1dac6eb`. The target boundaries are accepted in
[ADR 0003](../adr/0003-adopt-a-modular-feature-architecture.md).

## Edge classes and cycle result

The frontend inventory parsed local TS/TSX declarations separately rather
than treating every matching string as a runtime dependency:

- 47 value-bearing static local import declarations;
- 19 `import type`-only local declarations;
- 13 dynamic `import()` expressions representing 9 distinct source/target
  pairs;
- 16 test files plus `testSetup.ts`, whose edges are test-only;
- CSS side-effect import `main -> styles` is a production edge;
- external packages are recorded as dependencies but are not nodes in the
  local module cycle graph.

Cycle result:

| Graph | Existing cycles |
| --- | --- |
| Production runtime static imports | none |
| Production runtime plus dynamic imports | none |
| Production including type-only imports | `changes -> diffCache -> changes`; the reverse edge is `import type { FileDiff }`, so it is erased and is not a runtime/bundle cycle |
| Tests plus production | none; production has no edge to a test file |
| Rust production modules | none: binary `main -> gitodile_lib`; library `lib -> watch` |
| Transport | no module cycle; renderer requests travel to Rust and the watcher emits a typed event back |

The mixed type/value cycle is still architectural debt: `FileDiff` is owned by
the Changes component module while the cache is an app-owned service. Tasks
027/028 remove it by giving the changes feature a public domain entry point.
CI must continue to distinguish that debt from an actual eager import.

## Current frontend responsibilities

| Module(s) | Current responsibility | Material outgoing edges / issue |
| --- | --- | --- |
| `main.tsx` | bootstrap, window show, shell, repository sessions, request generations, watcher subscription, refresh/mutation orchestration, Overview, Settings, dialogs and feature composition | imports almost every durable concept; direct IPC calls; root of all current feature composition |
| `screens.tsx` | navigation registry, lazy screen declarations, idle prefetch list, keep-alive host and switch profiler | dynamic edges to Changes, Version lines, dialogs and pending/publish chunks; type edge to `projectSessions` |
| `projectSessions.ts` | open-project reducer, cached status/version-line/pending snapshots, navigation and mutation phases | type edges to `repositoryOverview`, `publish` and `versionLines`; canonical path currently doubles as session identity |
| `repositoryOverview.ts` | repository/status wire shapes plus plain-language status derivation and sorting | imported by app, changes, save, publish and session modules; it is the current accidental domain-type hub |
| `changes.tsx` | changes screen, diff types/parsing presentation, file selection, virtualization, file reads, save dialog and speculative batch warm-up | runtime edges to `diffCache`, `saveVersionDialog`, file icons and UI helpers; direct IPC calls |
| `diffCache.ts` | per-project diff cache and `read_file_diff` request dedupe | runtime edge from Changes/app; type-only edge back to `changes` creates the mixed cycle |
| `saveVersion.ts`, `saveVersionDialog.tsx` | save plan/result types, breakdown and save workflow | dialog directly invokes plan/execute commands; Changes owns its visual entry |
| `publish.ts`, `publishDialog.tsx`, `pendingVersions.tsx` | publish/remotes/pending types and workflows, saved-version file inspection | both visual modules import runtime helpers/types from Changes and file icons; direct IPC calls |
| `versionLines.ts`, `versionLinesPanel.tsx`, `versionLinesDialog.tsx` | branch inventory types and create/switch/delete workflow | panel imports dialogs; dialogs invoke Rust directly; app owns snapshot freshness |
| `fileIcons.ts` | approximately 70 generated file-type SVG components and path-to-icon mapping | shared by Changes, pending versions, publish and Overview's deferred icon; deliberately isolated in a separate chunk |
| `i18n.tsx`, `styles.css` | all translations and all product styling | global ownership is postponed to task 030, deliberately after feature behavior migrates |
| `appError.ts`, `modalFocus.ts`, `autoHideScrollbar.ts`, `loadingBar.tsx`, `popupMenu.tsx`, `tooltip.tsx`, `projectAvatar.ts` | stable cross-cutting helpers/primitives | candidates for shared placement only where their present consumers prove stable reuse |
| `projectSwitcher.tsx` | open-project switcher UI | app-level UI using i18n/avatar/scrollbar primitives |

## Static production module edges

The list below groups imports by source. `type:` is erased by TypeScript;
`dynamic:` preserves a lazy boundary.

```text
appError -> type:i18n
changes -> appError, autoHideScrollbar, diffCache, fileIcons, i18n,
           loadingBar, popupMenu, repositoryOverview, saveVersionDialog,
           type:repositoryOverview
diffCache -> type:changes, type:repositoryOverview
main -> appError, autoHideScrollbar, diffCache, i18n, loadingBar, modalFocus,
        projectSessions, projectSwitcher, repositoryOverview, screens, styles,
        tooltip, type:publish, type:versionLines
main -> dynamic:fileIcons, dynamic:pendingVersions, dynamic:publishDialog,
        dynamic:versionLinesDialog
pendingVersions -> autoHideScrollbar, changes, fileIcons, i18n, type:publish
projectSessions -> type:publish, type:repositoryOverview, type:versionLines
projectSwitcher -> autoHideScrollbar, i18n, projectAvatar
publish -> type:repositoryOverview
publishDialog -> appError, autoHideScrollbar, changes, fileIcons, i18n,
                 modalFocus, type:publish
saveVersion -> type:repositoryOverview
saveVersionDialog -> appError, autoHideScrollbar, i18n, modalFocus,
                     saveVersion, type:repositoryOverview
screens -> type:i18n, type:projectSessions
screens -> dynamic:changes, dynamic:pendingVersions, dynamic:publishDialog,
           dynamic:versionLinesDialog, dynamic:versionLinesPanel
versionLines -> type:repositoryOverview
versionLinesDialog -> appError, autoHideScrollbar, i18n, modalFocus,
                      type:versionLines
versionLinesPanel -> i18n, loadingBar, popupMenu, versionLinesDialog,
                     type:versionLines
```

Dynamic duplicates are intentional: the `lazy()` declaration and the idle
prefetch may name the same module. The future guard compares the resolved
module relationship, while the screen registry test verifies both declarations
remain sourced from the same registration path.

## Test-only edges

Tests import production modules, Testing Library/Vitest and a mocked Tauri
boundary. There are no production-to-test imports. The important ownership
clusters are:

| Tests | Production surface covered |
| --- | --- |
| `main.test.tsx` | app shell, open/restore/close races, screen keep-alive and command lifecycle |
| `changes.test.ts`, `changesPanel.test.tsx` | diff parsing/presentation, batch warm-up and cache remount behavior |
| `projectSessions.test.ts` | reducer, generations, watch suppression and navigation |
| `saveVersion*.test.*` | save breakdown, preview/execute dialog behavior |
| `publishDialog.test.tsx`, `pendingVersions.test.tsx` | publish and saved-version inspection |
| `versionLines*.test.*` | branch inventory and create/switch/delete UI |
| remaining focused tests | i18n, status mapping, switcher and shared UI helpers |

Future architecture tests treat test-only edges as a separate graph: tests may
import a feature public entry point and an approved feature-local test helper,
but may not make a production internal module public merely for testing.

## Current Rust responsibilities

| Module | Current responsibility | Boundary issue |
| --- | --- | --- |
| `main.rs` | release console setting and call to `gitodile_lib::run()` | already thin |
| `lib.rs` | all 30 commands; Git runner; output caps; repository, status, diff, identity, save, publish and branch models; parsing; errors; Tauri builder; 169 of the 180 Rust tests | primary migration target |
| `watch.rs` | filesystem filtering, burst debounce, watcher registry and 11 tests | already a distinct adapter, but payload/session/concurrency contracts are not yet the task-025 form |

There are no Rust module cycles. The problem is concentration and missing
enforcement, not a cyclic compiler graph.

## IPC inventory and call sites

All registered commands use narrow argument objects. `app_status` is registered
but has no production renderer call. Process counts below are the normal
successful-path shape at `bce8db0`; validation/error branches may exit earlier.
`N` means input/repository dependent and is called out rather than hidden.

| Command | Renderer owner/call site | Class | Native-process shape |
| --- | --- | --- | --- |
| `app_status` | none | read | 0 |
| `show_main_window` | `main.tsx` bootstrap | platform mutation | 0 |
| `open_repository` | `main.tsx` open and startup restore | read | 6 Git for an ordinary branch; bare/error branches vary |
| `read_working_tree_status` | `main.tsx` session refresh | read | 1 Git |
| `read_file_diff` | `diffCache.ts` | read | 2 Git for untracked, 3 for tracked/conflict |
| `read_file_lines` | `changes.tsx` context expansion | read | 0 Git; bounded filesystem read |
| `read_working_tree_diffs` | `changes.tsx` speculative mount warm-up | read | 1 status + at most 1 batched tracked diff = 1-2 Git |
| `git_diagnostics` | `main.tsx` Settings | read | 1 Git process attempt |
| `install_git` | `main.tsx` Settings | platform mutation | 1 OS installer process, 0 Git |
| `update_git` | `main.tsx` Settings | platform mutation | 1 OS package-manager process, 0 Git |
| `check_git_update` | `main.tsx` Settings | remote/platform read | 0 when cached, otherwise 1 package-manager process |
| `get_git_identity` | `main.tsx` Settings | read | 2 Git config reads |
| `set_git_identity` | `main.tsx` Settings | local mutation | 2 Git config writes |
| `plan_save_version` | `saveVersionDialog.tsx` | history-mutation preview | multi-step status, identity, index/tree and token validation; not bounded by one runner policy yet |
| `save_version` | `saveVersionDialog.tsx` | history mutation | repeats preview validation, then index/commit/restore and result reads; hook-dependent |
| `discover_remotes` | `publishDialog.tsx` | read | 1 Git |
| `list_unpublished_versions` | `main.tsx` session refresh | read | branch/upstream-dependent multi-step read |
| `read_commit_file_changes` | `pendingVersions.tsx`, `publishDialog.tsx` | read | 1 Git |
| `read_commit_file_diff` | `pendingVersions.tsx` | read | status/validation plus capped diff; 2 Git normal path |
| `plan_publish` | `publishDialog.tsx` | remote-mutation preview | remote/branch-dependent multi-step read; no network push |
| `publish` | `publishDialog.tsx` | remote mutation | repeats validation plus 1 networked push and result reads |
| `get_version_lines` | `main.tsx` project activation/invalidation | read | 5 Git on Git 2.41+ for the four-branch reference repo; legacy fallback is `N` |
| `plan_create_version_line` | `versionLinesDialog.tsx` | local-mutation preview | multi-step branch/status/token validation |
| `create_version_line` | `versionLinesDialog.tsx` | local mutation | repeats preview, 1 branch/switch mutation, then `get_version_lines` |
| `plan_switch_version_line` | `versionLinesDialog.tsx` | local-mutation preview | multi-step status/ref/worktree/diff validation |
| `switch_version_line` | `versionLinesDialog.tsx` | local mutation | repeats preview, 1 switch, then `get_version_lines` |
| `plan_delete_version_line` | `versionLinesDialog.tsx` | destructive preview | multi-step reachability/worktree/status validation |
| `delete_version_line` | `versionLinesDialog.tsx` | destructive local mutation | repeats preview, 1 safe `branch -d`, then `get_version_lines` |
| `watch_repository` | `main.tsx` active-session effect | read/platform | 2 Git then OS watcher creation |
| `unwatch_repository` | `main.tsx` effect cleanup | platform mutation | 0 |

The multi-step entries are a finding, not an omitted measurement. They call
Git directly from domain helpers, have branch-dependent loops and lack a
single timeout/output/cancellation/concurrency policy. Task 024 owns that
classification and bounded runner; task 029 records exact before/after
mutation counts without changing their safety behavior.

## Events and watcher boundaries

One Rust-to-renderer event exists:

```text
watch.rs
  emits "repository-changed" { path, repositoryStateChanged }
    -> main.tsx mount-once listener
      -> checkWorkingTree(path)
      -> refreshRepositoryState(path) when Git metadata changed
```

The payload carries a canonical path but no session epoch. `main.tsx` drops an
event if the path is not open and queues one during an operation, but a
close/reopen of the same path is not distinguishable at the transport level.
The watcher is keyed per active worktree and does not fan shared-ref changes to
every open worktree with the same `commonGitDir`. Those are explicit task-025
gaps, not changes made by task 023.

## Shared concepts and their target owner

| Current concept | Current locations | Target owner |
| --- | --- | --- |
| repository/worktree identity | Rust `RepositoryInfo`, TS `repositoryOverview`, session path | repository domain; IPC serializer mirrors it |
| working-tree snapshot and `ChangeCategory` | Rust `lib.rs`, TS `repositoryOverview`, save/publish/change consumers | status domain |
| file diff | Rust `lib.rs`, TS `changes.tsx`, `diffCache` | changes domain |
| operation plan / state token | separate Rust/TS shapes per mutation | owning mutation feature plus stable IPC contract helpers |
| application error | Rust `AppError`, TS localization assumptions | Rust `error` contract and renderer adapter |
| project incarnation | implicit generation maps keyed by path | project runtime session epoch |
| repository freshness | watcher boolean, app refresh functions and reducer generations | typed invalidation protocol plus feature controllers |
| Git execution | `run_git`, capped runner and direct `Command` construction throughout `lib.rs` | bounded `git` adapter governed by repository access |
| file icon mapping | `fileIcons.ts`, imported by three feature views | shared UI asset with a hard lazy-boundary rule |
| translations/styles | global files | feature-owned files after task 030; shared tokens/runtime stay shared |

## Confirmed child boundaries

The evidence confirms the task 022 order without amendments. Rust enforcement
must precede session/watcher IPC (024 before 025); both precede the frontend
runtime (026). Version lines remains the smallest complete read+mutation pilot
(027). Changes/status reads follow (028), then safety-sensitive save/publish
mutations (029). Styles/i18n remain a separate migration (030), and only 031
may declare the architecture complete or unlock History.
