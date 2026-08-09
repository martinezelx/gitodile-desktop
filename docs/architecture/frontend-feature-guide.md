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
