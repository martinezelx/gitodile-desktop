# Frontend feature and screen guide

Use this path for every functional screen. Placeholders and app overlays use
the same registry but do not pretend to be screens.

## 1. Own the feature

Create `src/features/<feature>/` with an explicit `index.ts`. UI, controller,
selectors, ports, tests and the screen descriptor stay with that owner.
Feature code may import the neutral contracts in `src/screenModule.tsx` and
`src/projectRuntime.ts`; it must not import `main.tsx`, `bootstrap.tsx` or
`screens.tsx`. Cross-feature consumers use the owning feature's `index.ts`,
not an internal file.

## 2. Declare one functional descriptor

Use `createLazyScreenContainer(loader, select)` and put the returned container
on the descriptor. The factory owns the one module promise used by both
`React.lazy` and primary preload; there is no second import string that can
drift. List only genuinely additional chunks in `additionalPreloads`.

A functional descriptor must declare:

- a stable id and translated nav/command labels;
- icon and navigation section;
- whether an open project is required;
- its container;
- `hidden: retain-suspended` and an explicit eviction scope;
- `hidden-inert` accessibility and active-only announcement policy;
- an optional numeric performance budget.

Add the feature-owned descriptor to `SCREEN_MODULES` in `src/screens.tsx`.
Expanded/compact navigation, command palette, project guard, lazy/preload,
keep-alive, accessibility hiding and screen profiling are derived from that
registration. Do not wire any of those separately in `main.tsx`.

## 3. Read project state through selectors

Receive the exact `ProjectRuntime` instance for the project session. Use
`useProjectSelector` in controllers that remain active and
`useActiveProjectSelector` inside screens. Keep selectors stable and narrow.
The latter unsubscribes while hidden, freezes the selected value, and reads
the current atomic snapshot when activated. There is no ambient current-
project context: a feature cannot silently subscribe to another open session.

Reducers must preserve object identity for unchanged state. A selector whose
value is equal must not rerender for another project or feature's transition.

## 4. Treat lifecycle as behavior

- `active`: subscriptions and `useActiveScreenEffect` work may run.
- `hidden`: DOM/local UI state is retained, the slot is `hidden` and `inert`,
  active-only effects are cleaned up, project subscriptions are detached and
  live announcements are off.
- `evicted`: the screen unmounts and releases local resources. Project-scoped
  screens are evicted when the active session epoch changes or closes.

Visibility is not invalidation. Never fetch, poll or warm a cache because a
screen became active. A selected detail may perform the read required to show
that user-requested content; speculative reads belong to the runtime path
below.

## 5. Warm only from freshness owners

Use `projectRuntime.scheduleCacheWarm` with reason `project-activation` or
`repository-invalidation`. It is idle-deferred, cancellable and deduplicated
by key. Successful mutations and explicit refreshes feed the same invalidation
model. The API intentionally has no visibility reason.

Chunk preloads remain app-level idle work through `prefetchScreenChunks` after
session restore. Neither chunk nor repository warming may precede first paint.

## 6. Prove the contract

At minimum add tests for:

- duplicate/incomplete registration;
- one loader shared by lazy mount and primary preload;
- first visit, warmed revisit identity, `hidden`/`inert` and project eviction;
- no repository IPC caused by arrival;
- timers/effects and store subscriptions suspended while hidden;
- activation synchronizing to the current snapshot;
- unrelated selector updates and StrictMode/concurrent rendering;
- loading, empty, error and keyboard/accessibility behavior owned by the
  feature.

Run `pnpm run check:architecture`. It analyzes runtime, type-only, dynamic and
test edges, rejects production cycles/directions, protects the deferred
`fileIcons` path and self-tests a seeded forbidden feature-to-app edge with an
owning-module error.

For the complete read-and-mutation example, including epoch-keyed request
deduplication, mutation supersession, bounded eviction and the Rust service
boundary, see [the Version-lines reference slice](version-lines-reference-slice.md).

For read-only repository state, use the task-028 ownership split: repository
identity/invalidation coordination, status snapshot equality/generations and
Changes diff caching remain separate feature policies. Do not generalize the
four-epoch, 256-entry and approximate 40 MiB diff limits to small metadata
snapshots, and do not move the whole-tree warm-up into a screen effect.

## 7. Own styles and translations

Put feature CSS in `src/features/<feature>/<feature>.css` and register it in
`src/styles.css`. That entry file is the single eager cascade manifest; its
order is tokens, base, app shell, shared primitives, then the listed feature
owners. Do not import screen CSS from a lazy component: an eager manifest keeps
the first feature frame styled and makes production ordering reviewable and
testable. Keep responsive, reduced-motion, forced-color, focus and dense-data
rules with the selector owner unless the rule is genuinely shared.

Put English and Spanish strings in the feature's `translations.ts`. Export one
namespace with a feature-local interface and exact `en`/`es` object literals,
then compose it eagerly in `src/i18n.tsx`. This keeps per-feature missing/extra
keys and formatter signatures compile-checked while preserving the complete
`Translations` type and `useLanguage()` ergonomics. Navigation, palette and
other shell strings remain in `src/app/translations.ts`; shared errors and
common actions live in `src/shared/i18n/translations.ts`. Do not load a
dictionary from a screen effect or render translation keys while it arrives.

## 8. Expected greenfield footprint

The adapter, port, controller, descriptor, UI, translations, styles, and tests
remain inside `src/features/<feature>/`. A project-backed screen with one new
Rust command should normally require only the external edits below. A larger
footprint is a signal to look for a missing contract or misplaced policy.

| File | Edit | Kind |
| --- | --- | --- |
| `src/screens.tsx` | import + one `SCREEN_MODULES` entry | declarative registration |
| `src/projectSessions.ts` | widen the `ProjectView` union by one id | declarative |
| `src/app/translations.ts` | one palette label in the interface and both locales | shell copy |
| `src/main.tsx` | create the controller, register a read subscriber when needed (§9), add one `screens` record entry | composition wiring |
| `src/ipcContract.test.ts` | command count and name list | pinned contract |
| `src-tauri/src/lib.rs` | one `mod` and one `generate_handler!` entry | declarative registration |
| `src-tauri/src/ipc.rs` | one transport adapter | transport |
| `src-tauri/src/application.rs` | one `EXECUTION_INVENTORY` policy + one checked registry name | declarative policy |
| `docs/architecture/025-ipc-contract.json` | one command entry | declarative contract |

Neither composition root may gain workflow logic. Do not introduce a macro,
container, or dynamic registration mechanism merely to shrink this explicit
list; ADR 0003 rejects indirection that has only one consumer.

## 9. Staying fresh without editing another feature

A screen whose snapshot must survive an external repository change registers a
`RepositoryReadSubscriber` with the coordinator in `main.tsx`:

```ts
{
  id: "history",
  refreshOn: "shared-change",
  blocking: false,
  refresh: (query) => historyController.refresh(query),
  supersede: (query) => historyController.supersede(query),
}
```

Nothing inside `features/repository` changes; it must not know which features
consume invalidation.

- **`refreshOn`** is the narrowest invalidation that should refresh the
  subscriber. `worktree-change` also fires on shared changes because a HEAD/ref
  change moves the working tree. `shared-change` skips worktree-only events.
- **`blocking`** controls whether `refreshAll` waits for the subscriber. Only
  choose `true` when a caller awaiting refresh genuinely needs that snapshot;
  mutation callbacks await the same promise.

The coordinator refreshes repository identity first, starts background
subscribers, and then awaits blocking subscribers in registration order.
`readCoordinator.test.ts` pins that sequence; do not replace it with an
unreviewed concurrent `Promise.all`.

**Cache warming is a separate seam.** Speculative project-activation warming
lives in `src/features/repository/cacheWarming.ts`, which takes controllers as
named options. A feature that needs idle-deferred warming still registers there.
Keep this explicit seam until multiple independent registrants justify a more
general API.
