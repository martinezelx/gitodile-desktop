---
id: 022
title: Introduce a modular feature architecture and a performance-safe screen blueprint
status: active
priority: high
type: chore
areas:
  - architecture
  - frontend
  - rust
  - performance
created: 2026-08-01
completed:
---

# Goal

Refactor GitOdrile into an incremental modular monolith organized around its
product domains, with thin application-shell and Tauri composition roots. New
features and screens must have an obvious home, depend in one direction, and
inherit the performance, freshness, accessibility, and safety guarantees from
tasks 018–021 without rediscovering them feature by feature.

# User outcome

The app behaves exactly as it does now, but future work becomes safer and
faster to implement. A new screen such as History can start from a supported
blueprint that already provides lazy loading, idle prefetch, keep-alive state,
project isolation, request deduplication, stale-response protection, watcher-
driven freshness, async native work, bounded Git reads, accessibility, and
performance instrumentation.

# Context

The product has outgrown its scaffold:

- `src-tauri/src/lib.rs` is about 9,438 lines and contains command adapters,
  Git process execution, parsing, domain decisions, mutations, error mapping,
  and most Rust tests for unrelated domains.
- `src/main.tsx` is about 2,816 lines and combines the application shell,
  navigation, preferences, project-session orchestration, request lifecycles,
  dialogs, screen composition, and several large UI components.
- `src/styles.css` is about 2,023 lines and `src/i18n.tsx` about 1,531 lines,
  both spanning every feature.
- `src/changes.tsx`, `src/versionLinesDialog.tsx`, and other feature files are
  becoming their own secondary monoliths.

The existing boundaries in `docs/ARCHITECTURE.md` remain correct:
`repository`, `status`, `history`, `changes`, `sync`, `recovery`, `conflicts`,
`platform`, and `credentials`. The problem is that the filesystem and
composition roots do not enforce those boundaries yet.

Tasks 018–021 also established non-negotiable runtime behavior:

1. first paint wins over speculative work;
2. screens are lazy, idle-prefetched, mounted on first visit, then kept alive;
3. hidden screens are frozen, `hidden`, and `inert`;
4. screen arrival never triggers repository work;
5. repository snapshots are cached per canonical project and refreshed only
   through explicit invalidations;
6. concurrent requests are deduplicated, superseded responses are rejected,
   and unchanged snapshots preserve identity;
7. blocking Git/filesystem/network work runs outside the UI thread;
8. Git facts are read in bounded batches, never one process per visible row;
9. long lists/diffs use bounded DOM work and virtualization;
10. profiling is opt-in so measurement does not tax ordinary development.

Architecture work that loses any of these guarantees is a regression even if
the resulting files are smaller.

# Architectural direction

Use a **modular monolith with vertical feature slices** and explicit ports at
real boundaries. Do not impose a ceremonial Clean Architecture layer on every
helper and do not create a generic framework inside the app.

The intended dependency direction is:

```text
app composition / screen registry
  -> feature UI + feature application controller
    -> typed feature port
      -> Tauri command adapter
        -> Rust domain service
          -> shared Git runner / filesystem / platform adapters
```

Shared code is allowed only when at least two domains use the same stable
concept. Product-domain types stay with their owning feature; `shared/` must
not become a miscellaneous dumping ground.

Before moving production code, add an ADR that confirms or adjusts this
direction and compares at least:

- vertical feature slices with a thin composition root;
- traditional technical layers (`components/`, `hooks/`, `services/`);
- a global state library versus the existing reducer with selector-capable
  subscriptions or narrowly split contexts;
- a big-bang rewrite versus an incremental strangler migration.

Any new dependency requires a concrete benefit, bundle/runtime cost, and an
alternative-without-dependency analysis in that ADR.

# Scope

## 1. Baseline and dependency map

- Record current file sizes, production chunks, startup ordering, warmed
  screen-switch measurements, Git process counts, test counts, and the Tauri
  command inventory.
- Map which responsibilities and imports currently cross domain boundaries.
- Identify cycles and shared concepts before selecting final module paths.
- Capture the decision in an ADR under `docs/adr/`.

## 2. Frontend composition root

- Reduce `main.tsx` to application composition: providers, global shell,
  project/session selection, top-level dialogs, and feature mounting.
- Move titlebar, palette, project navigation, settings, and overview UI into
  cohesive app-shell or feature modules.
- Move repository request lifecycles out of visual components into feature
  controllers/services with typed states and explicit invalidation events.
- Preserve per-project session isolation. A feature must not read or write a
  different project's state through an ambient global.
- Choose a state subscription approach that lets a feature rerender only for
  the state it consumes. Do not replace the current reducer merely to follow a
  trend; prove the selected approach with profiler numbers.

## 3. Screen module contract

- Evolve `src/screens.tsx` into a small shell plus typed `ScreenModule`
  descriptors owned by feature modules.
- A functional screen descriptor must declare:
  - stable id and translated navigation/palette labels;
  - icon and navigation section;
  - whether an open project is required;
  - lazy component loader and every related idle-prefetch chunk;
  - a container component that reads narrow feature state/actions instead of
    receiving a large prop bag from `App`;
  - keep-alive/eviction expectations and optional performance budget metadata.
- Registering the descriptor must automatically cover expanded and compact
  navigation, command palette, lazy prefetch, project guard, keep-alive host,
  accessibility hiding, and switch profiling.
- Screen visibility is never a data invalidation source. Each feature declares
  freshness events independently: project activation, watcher event, explicit
  refresh, successful mutation, or another named domain event.
- Add a compile/test guard that fails when a registered screen omits required
  performance or accessibility metadata.

## 4. Standard feature request lifecycle

- Extract one reusable, typed policy for cached project snapshots:
  - canonical project key;
  - bounded cache ownership and eviction;
  - one in-flight request per project/query;
  - monotonic generation or cancellation;
  - stale-response rejection across project close/reopen;
  - no loading flash when cached data exists;
  - stable identity when data is unchanged;
  - explicit invalidation events and error-with-last-snapshot behavior.
- Keep feature-specific equality, tokens, and invalidation decisions inside the
  feature rather than hiding them in a generic cache abstraction.
- Migrate Version lines first as the reference implementation, then status,
  pending versions, and diff caches without changing user-visible behavior.

## 5. Rust modularization

- Leave `src-tauri/src/lib.rs` as a thin Tauri composition root: state setup,
  plugin setup, command registration, and module exports.
- Split Rust by the durable product boundaries from `docs/ARCHITECTURE.md`.
  Each domain module owns its DTOs, parser, validation/planning, service, error
  mapping, and focused tests where practical.
- Extract the Git process runner, capped-output handling, environment/locale,
  path validation, and safe diagnostics into a narrow shared adapter used by
  domain services.
- Keep command names and serialized payloads stable during the move. Command
  adapters validate input and delegate; they do not contain domain workflows.
- All commands that may launch a process, touch the filesystem, wait on a
  watcher, or contact a remote remain asynchronous at the Tauri boundary.
- Preserve operation classification, preview, state-token validation,
  recovery behavior, hook/signing errors, and conflict safety exactly.
- Move integration scenarios into domain-focused test modules or
  `src-tauri/tests/` without weakening temporary-repository coverage.

## 6. Styles and translations

- Split `styles.css` into ordered layers: tokens/base, app shell, shared
  primitives, and feature-owned styles. Preserve the current production CSS
  ordering and theme behavior.
- Split translations into typed feature namespaces or dictionaries while
  preserving compile-time English/Spanish parity and the existing
  `useLanguage` ergonomics.
- Do not lazy-load core labels in a way that produces untranslated first
  frames or layout shifts.

## 7. Incremental migration

- Land the refactor in behavior-preserving, reviewable steps. Keep the app
  buildable and tests green after each step.
- Use Version lines as the pilot because it exercises caching, invalidation,
  mutations, dialogs, async Tauri work, and screen keep-alive.
- Migrate Overview/Status, Changes/Diffs, Save version, and Publish only after
  the pilot proves the boundaries.
- Do not implement History in this task. Task 015 should become the first new
  screen built on the completed blueprint, which validates that the
  architecture works for greenfield feature work rather than only migrations.

# Out of scope

- A visual redesign or user-facing workflow change.
- Implementing History, Recovery, conflicts, pull/integration, or other new
  product behavior.
- Replacing Tauri, React, system Git, or the local-first model.
- Introducing Redux, Zustand, XState, React Query, an IoC container, or a Rust
  framework without the ADR proving it solves a measured problem.
- A repository-wide rename performed only for aesthetic consistency.
- Abstract base classes, generic repositories, or indirection with only one
  concrete use.
- Weakening safety checks or tests to make code easier to move.

# Acceptance criteria

- [ ] An ADR records the chosen modular-monolith structure, dependency rules,
      state subscription choice, migration strategy, and rejected alternatives.
- [ ] `main.tsx` is a thin composition root and contains no feature-specific
      Git request lifecycle, parser, or large screen implementation.
- [ ] `src-tauri/src/lib.rs` is a thin Tauri composition root and contains no
      domain parser, operation planner, or Git workflow implementation.
- [ ] Repository, status, changes, version-lines, save, sync/publish, platform,
      credentials, and watcher code have explicit owners and dependency
      direction; no circular frontend or Rust domain dependencies remain.
- [ ] Version lines is migrated as the reference vertical slice with its
      existing behavior and safety tests intact.
- [ ] All current functional screens use typed screen descriptors and inherit
      nav, palette, lazy loading, idle prefetch, guard, keep-alive, inert hiding,
      eviction, and opt-in profiling from one registration path.
- [ ] A screen-contract guard test fails if a new functional screen omits a
      required chunk loader, project requirement, container, or accessibility/
      performance metadata.
- [ ] Cached feature reads share a documented lifecycle for dedupe,
      generations/cancellation, close/reopen isolation, stable snapshots,
      background errors, and explicit invalidation without becoming a generic
      catch-all cache.
- [ ] No repository read is triggered solely by screen arrival, and a
      regression test proves repeated navigation issues no new Tauri command.
- [ ] Every potentially blocking Tauri command remains asynchronous, and no
      feature launches one Git process per rendered row/item.
- [ ] Long lists and diffs remain bounded/virtualized; hidden screens do not
      observe, poll, announce, or rerender in the background.
- [ ] CSS and translations have feature ownership without theme, locale,
      first-paint, or chunk-order regressions.
- [ ] Existing Tauri command names/payloads, local data behavior, operation
      plans, recovery guarantees, and user-facing copy remain compatible.
- [ ] Production entry/chunk sizes, startup ordering, warmed screen-switch
      timings, memory after visiting all screens, and Git process counts are
      recorded before/after with no material regression.
- [ ] Windows desktop validation passes; macOS/WebKit and Linux/WebKitGTK risks
      are documented or tested where available.
- [ ] `AGENTS.md`, `docs/ARCHITECTURE.md`, and the new-screen implementation
      guide describe the final structure and performance contract.

# Required tests and validation

## Architecture guardrails

- Module-boundary/import-direction checks that run in CI without relying only
  on reviewer memory.
- Screen registry contract and duplicate-id tests.
- A minimal test screen proving first-visit lazy mount, warmed revisit identity,
  hidden/inert accessibility, project-session eviction, and no arrival fetch.
- Feature-store selector tests proving unrelated state does not rerender an
  active or inactive screen.

## Request lifecycle

- Concurrent deduplication and supersession.
- Close/reopen of the same canonical path while a request is pending.
- Project switching during success and failure.
- Cached success followed by unchanged success, changed success, and error.
- Mutation result superseding an older discovery read.
- Watcher bursts coalescing without starving the UI.

## Rust boundaries

- Existing parser/planner unit tests remain beside their owning modules.
- Existing temporary-repository integration tests remain behaviorally
  equivalent after moves.
- A command inventory test or review check verifies that every blocking
  adapter uses asynchronous Tauri execution.
- Process-count assertions cover representative status, changes, history,
  version-line, and publish planning reads where deterministic.

## Final checks

```bash
pnpm run typecheck
pnpm run test
pnpm run build
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Repeat the task-021 warmed desktop stress sequence and record profiler/process
measurements before and after each migration phase, not only at the end.

# Dependencies

- Builds on tasks 018, 019, 020, and 021.
- Should land before implementing task 015's History screen; History is the
  first greenfield consumer of the completed screen blueprint.
- Must preserve the safety behavior established by tasks 010, 011, 012, 016,
  and the watcher hardening that followed task 020.

# Decisions

- Prefer a modular monolith and vertical slices over a big-bang rewrite.
- Preserve behavior first; smaller files are evidence of ownership, not the
  objective by themselves.
- Use Version lines as the pilot and History as the first new consumer.
- Performance contracts from tasks 018–021 are architectural invariants, not
  optional screen-level optimizations.
- New dependencies and generic abstractions require measured justification.

# Implementation notes

Complete during implementation. Record the ADR path, final module tree,
dependency enforcement mechanism, state subscription decision, migration
sequence, command compatibility notes, and before/after measurements.

# Validation

Record exact baselines and results for every migration phase.
