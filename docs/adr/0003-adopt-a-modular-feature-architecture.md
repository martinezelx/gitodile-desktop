# ADR 0003: Adopt a modular feature architecture with project-scoped state

- Status: accepted
- Date: 2026-08-08

## Context

GitOdrile's behavior is covered by 206 frontend tests and 180 Rust tests, but
its composition roots have accumulated most of that behavior. At the task 022
starting point, `src/main.tsx` has 3,367 physical lines and
`src-tauri/src/lib.rs` has 9,897. The former owns shell rendering, project
sessions, request generations, repository invalidation, IPC calls, dialogs and
feature composition. The latter owns Tauri transport, Git process execution,
parsing, repository identity, product decisions, mutations, errors and tests.

The problem is not the line counts themselves. Important guarantees currently
depend on conventions spanning those files:

- no Git work before first paint;
- screens render cached state and never fetch merely because they became
  visible;
- lazy screen chunks and their idle preloads remain aligned;
- cached snapshots preserve identity when unchanged;
- project close/reopen rejects responses from an older incarnation;
- Git mutations preserve existing safety, hooks, signing and structured
  errors;
- repository watching does not create refresh loops;
- related worktrees must eventually share a Rust-owned concurrency boundary.

Task 022 needs a migration architecture that makes those guarantees supported
contracts without requiring a repository-wide rewrite.

## Decision

### Architectural style

Adopt an incremental modular monolith with vertical frontend features, durable
Rust product-domain modules and thin composition/transport roots. Migrate by a
strangler sequence: existing entry points remain as compatibility adapters
until their consumers move, and every child task must leave `main` buildable.

The intended dependency flow is:

```text
frontend app composition and screen registry
  -> feature UI and controller
    -> feature-owned port
      -> Tauri adapter
        -> thin Rust IPC adapter
          -> Rust application/domain module
            -> repository access coordinator
              -> Git runner, filesystem, watcher and platform adapters
```

This is a dependency direction, not a requirement to create an interface for
every function. A port is introduced only where code crosses the renderer,
filesystem, process, clock, watcher or OS boundary, or where a test needs a
real substitute.

### Frontend modules and public entry points

The target structure is:

```text
src/
  app/                         # composition only
    App.tsx
    screens.tsx
    projectRuntime.ts
  features/
    repository/
    status/
    changes/
    version-lines/
    save-version/
    publish/
    history/
    recovery/
    conflicts/
  platform/
    tauri/                     # invoke/listen adapters only
  shared/
    ui/                        # proven visual primitives
    i18n/                      # translation runtime, not feature copy
```

Every feature exposes an `index.ts` public entry point. Internal components,
controllers, reducers and adapters are not imported across feature roots.
The app layer may import feature entry points; features never import `app/`.
A feature may import `platform/tauri` only through its declared port adapter,
not from visual components. Feature-to-feature imports are permitted only for
a type or capability deliberately exported by the owning feature. Repeated
cross-feature UI reuse moves to `shared/ui` only after two real consumers have
the same stable requirement.

Ownership for the first migration is:

| Module | Owns | Public entry point |
| --- | --- | --- |
| `app` | bootstrap, shell, screen registry, project-runtime creation and feature wiring | `app/App.tsx`, `app/screens.tsx` |
| `repository` | repository identity, open/close/switch intent and project metadata | `features/repository/index.ts` |
| `status` | working-tree snapshot and plain-language status mapping | `features/status/index.ts` |
| `changes` | changed-file selection, diff cache, diff presentation and bounded lists | `features/changes/index.ts` |
| `version-lines` | branch inventory and create/switch/delete controllers | `features/version-lines/index.ts` |
| `save-version` | save plan/result types and save workflow | `features/save-version/index.ts` |
| `publish` | remotes, pending versions, publish plan/result and publish workflow | `features/publish/index.ts` |
| `history`, `recovery`, `conflicts` | their future product workflows | their own `index.ts` |
| `platform/tauri` | typed renderer-side IPC/event implementations | one adapter entry per feature port |
| `shared/ui` | stable, behavior-free UI primitives | explicit named exports |
| `shared/i18n` | locale selection and shared translation plumbing | `shared/i18n/index.ts` |

Product-domain types stay with the feature that owns their meaning. For
example, `ChangeCategory` belongs to status, `FileDiff` belongs to changes and
`PublishPlan` belongs to publish. A consumer imports the owner's public type;
it does not duplicate the wire shape or move the type to a miscellaneous
`shared/types` file.

### Frontend state

Keep React's built-in primitives. Each open project gets a runtime with an
immutable reducer and a distinct session epoch. The runtime exposes narrow
commands plus selector subscriptions through `useSyncExternalStore`. Feature
controllers select only the state they need; visual components receive values
and callbacks and do not invoke Tauri directly.

The canonical worktree path identifies the project. It does not identify an
open incarnation: every close/reopen creates a new session epoch, and every
request, response and watcher event is checked against it. Repository-derived
snapshots, in-progress operations and per-project UI state live in that
runtime. Persistent application preferences and the recent-project list stay
separate. Inactive screens have explicit `active`, `hidden` and `evicted`
lifecycle states; `hidden` and `inert` remain accessibility properties, not a
substitute for suspending effects.

No Redux, Zustand, XState or React Query dependency is added. The current
requirements are local immutable transitions, selector subscriptions and
request ownership, all available from React and a small project-owned store.
Reconsider a state dependency only if measured behavior requires caching,
statecharts or devtools that the supported runtime cannot provide.

### Rust modules and public entry points

The target structure is:

```text
src-tauri/src/
  lib.rs                       # builder and registration only
  ipc/                         # Tauri serialization/adapters
  application/
    repository/
    status/
    changes/
    version_lines/
    save_version/
    publish/
    history/
    recovery/
    conflicts/
  repository_access/          # authorization and per-commonGitDir scheduling
  git/                         # bounded process runner and Git adapter
  watch/                       # filesystem adapter and typed invalidations
  platform/                    # OS-specific adapters
  error.rs                     # stable application error contract
```

Each application domain exposes its public API from `mod.rs`; sibling modules
cannot import its private implementation. `ipc` validates transport input and
delegates. It contains no Git command construction or product planning.
Application modules own use cases and domain decisions. They depend on narrow
ports implemented by `repository_access`, `git`, `watch` and `platform`.
Infrastructure never imports IPC or frontend-shaped view code.

The repository access coordinator is authoritative for project authorization
and concurrency. Its identity key is `commonGitDir` where related worktrees
share mutable Git state, with worktree identity retained for operations that
touch files. Frontend request deduplication remains a UX optimization, never a
safety boundary.

Every native command declares an execution policy: read/mutation
classification, output cap, timeout, prompt policy, cancellation behavior,
safe diagnostics and concurrency class. The system Git executable remains the
backend; ADR 0001 is still only a proposal and is not activated by this
refactor.

### Dependency matrix

`yes` means imports may point from the row to the column through the column's
public entry point. A module always owns its internals.

| From / to | app or IPC | feature/application domain | feature-owned port | infrastructure adapter | shared domain owner | shared UI/i18n |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| app composition / Rust IPC | no | yes | yes | yes, for wiring only | yes | yes |
| feature UI/controller | no | same feature only | yes | no | yes | yes |
| application/domain service | no | same domain; explicit orchestration exception only | yes | no | yes | no |
| port | no | no | no | no | owner types only | no |
| infrastructure adapter | no | no | implements | same/lower infrastructure only | owner types only | no |
| shared UI/i18n | no | no | no | no | type-only when necessary | same module only |

There are no barrel exports spanning all features and no generic `shared/`
escape hatch. Cross-domain orchestration belongs in an application service
whose name describes the workflow.

### Automated dependency enforcement

Task 026 will add a pinned `dependency-cruiser` development dependency and a
checked-in rule set for frontend imports. The configuration must enable
`tsPreCompilationDeps` so erased type-only ownership edges remain visible and
must retain the tool's dynamic-edge classification. It must analyze:

- runtime static imports;
- `import type` edges (ownership rules apply, bundle-eagerness rules do not);
- dynamic imports (ownership and cycle rules apply, and lazy-boundary rules
  verify they stay dynamic);
- tests separately from production (tests may use approved test helpers and
  public feature APIs; production may never import tests).

It will fail on production cycles, forbidden directions, feature-internal
imports and an entry-to-`fileIcons` static path. The current mixed
`changes -> diffCache -> changes` cycle is permitted only while the reverse
edge remains type-only and is removed by task 027/028 ownership work.

Rust privacy and the compiler enforce private feature internals. A small
architecture test will parse `mod`/`use` declarations with a direct `syn`
development dependency, classify `#[cfg(test)]` edges separately, and fail on
forbidden cross-domain directions or cycles. This avoids an unpinned global
`cargo-modules` installation in CI. Both guards run in the existing CI jobs;
they are not added in task 023 because production modules have not moved yet.

### Migration sequence

Keep the child order in epic 022:

1. 023 records this decision and baselines.
2. 024 creates bounded Rust execution and repository access.
3. 025 establishes contract-tested IPC, session epochs and watcher events.
4. 026 creates the frontend runtime and dependency guards.
5. 027 migrates Version lines as the reference vertical slice.
6. 028 migrates repository, status, changes and diff reads.
7. 029 migrates save and publish mutations.
8. 030 moves feature-owned styles and translations.
9. 031 performs the cross-platform integration audit and closes the epic.

History task 015 remains blocked until 031. Task 024 must not be started as
part of this decision task.

### Dependency policy

A new production dependency requires a task or ADR recording its concrete
benefit, bundle/binary and runtime cost, maintenance/security cost, platform
implications and the smallest alternative without it. Lock versions and
licenses, avoid overlapping libraries and remove a dependency when its only
consumer disappears. Development-only architecture tools may not enter the
runtime bundle or release binary.

Dependencies considered for this migration:

| Candidate | Benefit | Cost and maintenance | Alternative | Decision |
| --- | --- | --- | --- | --- |
| `dependency-cruiser` (dev) | Resolves TS/TSX static, dynamic, type-only and test edges with declarative forbidden rules and cycle reports | pnpm install/lock growth and a config/API to maintain; zero runtime or bundle cost | custom parser using TypeScript 7's currently unstable compiler API; regex | Accept in task 026 after a pinned compatibility check |
| `syn` with `full` (Rust dev) | Correctly parses module/import syntax for a repository-owned architecture test | compile time and direct dev-dependency maintenance; already present transitively, zero release cost | regex or global `cargo-modules` | Accept when the Rust guard lands |
| `cargo-modules` global tool | Ready-made Rust module graph | extra CI install, version drift, limited GitOdrile-specific direction/test policy | `syn` architecture test plus compiler privacy | Reject |
| Redux/Zustand | selector stores and devtools | runtime bytes, another state model and migration cost | reducer plus `useSyncExternalStore` | Reject |
| XState | explicit statecharts | substantial concepts/runtime for flows that are currently linear plans | typed reducers and operation phases | Reject |
| React Query | request cache/deduplication | repository invalidation and session epochs still need custom ownership; cache semantics can conflict with local Git freshness | project runtime request registry | Reject |
| IoC container | automatic wiring | obscures the composition root and adds indirection with one implementation | constructors/functions at explicit roots | Reject |

## Consequences

### Positive

- New screens inherit one supported screen/runtime path rather than adding
  responsibilities to `main.tsx`.
- Rust becomes authoritative for repository authorization, concurrency and
  native execution policy.
- Domain ownership and public entry points are reviewable and enforceable.
- Session epochs make close/reopen races and watcher fan-out explicit.
- The migration can stop after any child task with compatibility adapters and
  tests intact.
- No production state or architecture dependency is added merely to move code.

### Negative

- Compatibility adapters temporarily duplicate call paths and make the tree
  less tidy during tasks 024-030.
- Project-runtime selectors and lifecycle contracts are code GitOdrile must
  maintain.
- Architecture tools add development install/compile cost.
- Cross-feature workflows require deliberate orchestration rather than a
  convenient import from another component.

### Observed after the task-031 audit

The migration produced the intended contracts. It did not, at first, produce the
intended frontend composition root, and this decision record should say so.

- **Rust met the decision.** `lib.rs` went from 9,897 lines to 762 production
  lines (plus 3,013 test lines): the builder, 31 command registrations and the
  Git process/platform adapters. `architecture.rs` fails the build if a named
  domain function reappears there.
- **`main.tsx` needed two more tasks.** Epic 022 left it at 2,730 lines from
  3,367, still rendering the Overview panel. Task 031 extracted the Settings
  overlay behind a port, removing seven direct `invoke` calls; task 040
  extracted Overview and took the file to 1,958 lines of app shell with no
  screen body. The `host-owned` container variant is gone from the contract, so
  a screen the shell composes by hand is now a type error rather than a
  convention. Overview registers eagerly — it paints before any project is open,
  so a lazy chunk would sit in front of first paint — which is why
  `createEagerScreenContainer` exists alongside the lazy one.
- **No task owned this.** Tasks 023-030 assigned migrations for version lines,
  reads, mutations, styles and translations. Overview and Settings were never
  assigned to anyone, which is why they survived a nine-task refactor. Future
  epics should enumerate every screen, not every layer.
- **"Thin composition root" was never measurable.** This ADR said "composition
  only" and epic 022 asked for "thin", which no reviewer could pass or fail.
  The testable property is the one that matters and it holds: task 031 built and
  removed a greenfield screen that required three registration lines in `lib.rs`
  and three wiring points in `main.tsx`, with no workflow logic in either. State
  future criteria as behavior a test can check, not as a size adjective.
- **Invalidation fan-out is not open for extension.** Each feature that consumes
  watcher invalidation is a positional parameter of
  `createRepositoryReadCoordinator` and a hardcoded call inside it. It is
  compile-checked and it works, but the repository feature knows about every
  dependent feature. Convert it to registered subscribers when the next consumer
  arrives. *Resolved by task 042: subscribers are a registered list, and
  `readCoordinator.ts` imports no other feature.*
- **The frontend guard this ADR specified never ran.** Task 026 added
  `dependency-cruiser` as decided below, and it cruised **zero** modules for
  `src` from that day until task 047 in 2026-08-11 — a bare directory argument
  is expanded with a default extension list that excludes `.ts`/`.tsx`, because
  the tool cannot load TypeScript 7's compiler API. It degraded silently instead
  of failing, and the seeded `.mjs` fixtures kept the self-test green, so the
  vacuum was invisible. Every dependency-direction claim in epic 022 rested on
  it.

  Two consequences worth keeping. First, the `tsPreCompilationDeps` requirement
  in this ADR cannot be met by the tool: type-only edges are now classified by
  reading the import statements that produced them, which is not the rejected
  "custom parser" — it only labels edges dependency-cruiser already found. Until
  that landed, 88 barrel cycles were reported that do not exist at runtime, and
  the real findings were buried in them. Second, a rule with a self-test that
  only exercises fixtures proves the rule, not the wiring; task 047 added cases
  that run the rules against `src`-shaped input.

### Observed after the epic-038 close-out

The accepted `Decision` above remains the migration target and is not rewritten
to hide divergence. The delivered tree differs in these explicit ways:

- **`platform/tauri` was not built.** Each feature owns a `tauriAdapter.ts`
  beside its typed port. Co-locating the contract and implementation proved the
  narrower ownership boundary, and task 051 made it executable: production
  feature modules may import `@tauri-apps/api` only from their own adapter.
  App-owned watcher, window and session lifecycle wiring remains in the
  composition root.
- **`shared/ui` is now a real public module.** Task 041 moved the loading bar,
  modal-focus hook, anchored popup behavior and auto-hide scrollbar contract
  behind named exports after multiple consumers established stable reuse.
- **Composition and extension exceptions are gone.** Task 040 removed the
  `host-owned` screen variant; task 042 replaced positional invalidation
  consumers with registered subscribers; task 048 exported the diff renderer
  from Changes and left the cross-feature allowlist empty; task 046 gave
  Settings ownership of its panel styles/translations and lazy chunk.
- **The frontend graph is native and non-vacuous.** Task 049 pinned TypeScript 6
  so dependency-cruiser itself reports type-only edges, removed the task-047
  parser workarounds and retained a minimum real-module count. ADR 0005 owns
  that toolchain decision and its TypeScript 7 exit condition.

### Observed after task 073

The physical tree now matches the ownership the migration delivered. The
`Decision` block above still shows the shape accepted in 2026; these are the
differences a reader should expect in `src/`:

- **`app/projectRuntime.ts` is `runtime/project/runtime.ts`.** The accepted tree
  put the project store inside the composition layer, but features depend on it
  and must not depend on `app/`. Splitting a neutral `runtime/` owner —
  `project/` for the store, session reducer and invalidation acceptance,
  `screen/` for the screen/lifecycle contracts — keeps that dependency legal
  without the store becoming an ambient global. The guard now forbids exactly
  `src/app/**` and `src/bootstrap.tsx` to features, rather than naming three
  root files.
- **Translation composition owns `src/i18n/`.** It is neither a shared primitive
  nor a feature; feature-owned `translations.ts` files and `shared/i18n`
  (shared copy plus the `AppError` vocabulary) are unchanged.
- **`shared/file-icons/` replaces the root `fileIcons.ts`.** It is the module
  itself at `index.ts`, not a re-export barrel, so the deferred boundary is
  unchanged; the entry-chunk guard now matches the new path and the icon chunk
  is byte-identical.
- **`contextMenu.ts` is `shared/ui/clipboard.ts`.** The file only ever exported
  `copyTextToClipboard`; the old name described a caller, not the owner.
- **Cross-cutting tests own `src/architecture/`.** The guard self-tests, the IPC
  contract snapshot and the style-cascade manifest test verify the repository,
  not a feature, and pretending otherwise was the reason they sat at the root.
- **The root keeps only entrypoints.** `bootstrap.tsx`, `styles.css` and the two
  ambient `.d.ts` files. An empty root was never the goal.

### Constraints

- Command names, payloads, error codes, safety previews, state tokens, hooks,
  signing behavior and local-only data handling remain compatible throughout
  the migration.
- First paint, idle prefetch, lazy boundaries, keep-alive accessibility,
  stable snapshots, bounded DOM work and watcher behavior are acceptance
  constraints, not optional cleanup.
- Significant deviations require a new ADR; they are not silently folded into
  a later child task.
- GitButler is research only under the restriction recorded in
  `../architecture/023-gitbutler-research.md`.

## Alternatives considered

### Technical layers as the primary module structure

Rejected. A top-level `components/services/types/hooks` split would shorten
files but keep each workflow spread across the repository and preserve the
same cross-feature ownership ambiguity.

### A crate or package per feature

Rejected for the current scale. It increases manifests, build boundaries and
versioning ceremony without a deployment or reuse requirement. Rust modules
and TypeScript entry points provide the needed boundaries inside one product.

### Big-bang rewrite

Rejected. It removes the ability to compare behavior and performance at each
commit, and makes compatibility adapters impossible to retire incrementally.

### Keep the current roots and rely on review checklists

Rejected. Tasks 018-021 already showed that manual prefetch and navigation
lists drift. Rules that protect safety and performance must be executable.

### Global context plus `useReducer` only

Rejected as the final subscription mechanism. It preserves one state model but
causes broad rerenders and gives feature controllers no narrow subscription
contract. The selected store still uses a reducer; `useSyncExternalStore`
adds project-scoped selectors without another library.
