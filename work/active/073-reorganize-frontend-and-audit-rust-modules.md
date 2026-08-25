---
id: 073
title: Reorganize frontend ownership and audit Rust module boundaries
status: active
priority: normal
type: refactor
areas:
  - frontend
  - rust
  - architecture
  - documentation
  - testing
created: 2026-08-24
completed:
parent:
queue: "18"
---

# Goal

Make the physical source tree reflect GitOdrile's already-delivered modular
architecture: keep only true entrypoints at the frontend root, give app shell,
project/screen runtime, shared primitives and architecture tests explicit
owners, colocate feature tests with the code they verify, and audit the Rust
crate for modules that have genuinely outgrown the current flat-module rule.

This is an ownership and maintainability refactor, not a product or behavioral
change.

# User outcome

The repository becomes easier to understand and navigate by inspection. A
contributor can tell where new code belongs without treating `src/` as an
implicit miscellaneous layer, tests sit beside their owners, and large Rust
modules are split only when doing so creates a real private boundary rather
than cosmetic symmetry with the frontend.

# Context

The architecture migration successfully established vertical frontend features,
typed ports/adapters, project-scoped runtime state, thin Rust IPC, and explicit
Rust domain modules. The dependency guards are green and the current
architecture is sound.

The remaining debt is mostly physical organization. `src/` still contains a
number of top-level modules that are neither entrypoints nor product features:

- `projectRuntime.ts`
- `projectSessions.ts`
- `repositoryInvalidation.ts`
- `screenModule.tsx`
- `projectSwitcher.tsx`
- `projectAvatar.ts`
- `i18n.tsx`
- `tooltip.tsx`
- `contextMenu.ts`
- `fileIcons.ts`
- architecture/style/feature tests at the root

Those files are not one generic concern. They form several distinct owners:
application composition/shell, project runtime, screen runtime, shared UI,
translation composition and architecture validation. Introducing a generic
`common/`, `utils/` or `shared/types/` bucket would only move the ambiguity one
level down and is explicitly not the target.

The current durable architecture also says Rust should remain flat until a
module genuinely needs internal submodules. Several product modules are now
large enough to deserve review (`version_lines.rs`, `sync.rs`, `history.rs`,
`changes.rs`, `clone.rs`, `recovery.rs`), but line count alone is not a reason
to split them.

# Target frontend shape

Use this as the intended direction, not as a requirement to create empty
folders or force every name exactly as written when the existing dependency
rules make a nearby name clearer:

```text
src/
  bootstrap.tsx
  styles.css
  vite-env.d.ts
  raw-icons.d.ts

  app/
    App.tsx
    screens.tsx
    ...existing shell modules
    project-switcher/
      ProjectSwitcher.tsx
      projectAvatar.ts
      colocated tests

  runtime/
    project/
      runtime.ts
      sessions.ts
      invalidation.ts
      colocated tests
    screen/
      module.tsx
      colocated tests

  i18n/
    index.tsx
    colocated composition/runtime tests

  features/
    <feature>/
      implementation + owner tests

  shared/
    ui/
      tooltip.tsx
      clipboard.ts
      ...existing primitives
    file-icons/
      index.ts
      colocated tests

  architecture/
    frontend guard/IPC contract tests that are genuinely cross-cutting

  assets/
  styles/
```

The root should contain true build/application entrypoints and declarations,
not be artificially empty.

# Scope

## Frontend source-tree reorganization

- Move `main.tsx` to an explicit app-composition owner such as
  `src/app/App.tsx`; keep `bootstrap.tsx` as the renderer entrypoint.
- Move `screens.tsx` under `src/app/` because it is the global screen registry,
  keep-alive host, prefetch coordinator and switch profiler.
- Group the neutral project lifecycle modules under an explicit runtime owner:
  `projectRuntime.ts`, `projectSessions.ts` and `repositoryInvalidation.ts`.
- Group `screenModule.tsx` under a neutral screen-runtime owner rather than a
  product feature or generic shared bucket.
- Move `projectSwitcher.tsx`, `projectAvatar.ts` and their owner tests into the
  app shell, preferably a focused `project-switcher/` subfolder.
- Move translation composition/runtime (`i18n.tsx` and its runtime tests) into
  an explicit `i18n/` owner while preserving feature-owned translation files
  and `shared/i18n` for shared copy/error localization.
- Move `tooltip.tsx` to `shared/ui`.
- Rename/rehome `contextMenu.ts` according to what it actually owns. Its
  current exported behavior is clipboard copying, so do not preserve a
  misleading context-menu filename merely for path compatibility.
- Move `fileIcons.ts` and its test to a dedicated shared owner while preserving
  its intentionally deferred bundle boundary. Do not route it through a barrel
  that makes the icon set statically reachable from the entry chunk.
- Keep `styles.css` at the root as the deliberate eager cascade manifest unless
  a measured/architectural reason says otherwise.
- Keep `bootstrap.tsx` at the root as the renderer entrypoint unless moving it
  materially improves the build boundary; do not move it merely for symmetry.

## Test ownership cleanup

- Inventory every top-level `src/*.test.*` file and assign it to the module or
  architectural concern it actually verifies.
- Colocate feature-specific tests with their feature owner.
- Split mixed root tests when one file currently verifies multiple owners; for
  example, do not move a mixed repository/status test wholesale into one
  feature if its assertions can be cleanly separated.
- Keep truly cross-cutting architecture/contract tests in a clearly named
  architecture owner rather than pretending they belong to one feature.
- Preserve test intent and coverage; this task must not delete tests simply to
  simplify the tree.

## Dependency and documentation updates

- Update all imports, dynamic imports, type-only imports and test paths after
  moves without weakening current public-entry-point rules.
- Update `scripts/check-frontend-architecture.mjs` and its self-tests so the
  same architectural guarantees remain enforced after the new paths.
- Preserve the rule that feature code cannot import app composition.
- Preserve the rule that Tauri APIs are owned by the approved adapters or
  composition boundaries.
- Preserve the entry-chunk guard around the file icon set after its move.
- Update `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/architecture/frontend-feature-guide.md`, ADR follow-up notes where
  necessary, and any path-sensitive documentation so the documented tree
  matches reality.
- Avoid introducing aliases solely to hide the moves. Prefer normal explicit
  imports unless an existing build alias already owns the same responsibility.

## Composition-root review

- Keep `App.tsx` as an explicit composition root: controller construction,
  feature wiring, watcher/session lifecycle and cross-feature orchestration are
  valid there.
- Review whether any remaining block in the current `main.tsx` is clearly shell
  presentation or a cohesive helper that already has an obvious owner and can
  move without adding indirection.
- Do not split composition into factories/containers merely to reduce line
  count. A large explicit composition root is preferable to opaque dependency
  wiring with one implementation.

## Rust module-boundary audit

- Review the current flat Rust production modules, with particular attention to
  the largest product owners (`version_lines.rs`, `sync.rs`, `history.rs`,
  `changes.rs`, `clone.rs`, `recovery.rs`).
- For each reviewed module, identify whether it contains multiple stable,
  private responsibilities that would benefit from a Rust submodule boundary.
  Examples may include parsing, planning, validation, read models, mutations or
  provider/platform-specific helpers, but use the code's actual responsibilities
  rather than a predetermined template.
- Split a Rust module only when there is a concrete benefit such as:
  - clearer private ownership;
  - reduced accidental sibling access;
  - easier focused testing;
  - materially simpler navigation/review;
  - a cohesive implementation unit with a narrow private/public boundary.
- If no Rust split is justified, record that conclusion in the implementation
  notes and leave the flat layout unchanged.
- If a split is justified, preserve the owning module's external API and keep
  IPC/application registration behavior unchanged.
- Update `src-tauri/src/architecture.rs` if path/module guards need to understand
  a new legitimate submodule structure; do not weaken forbidden dependency
  directions.

# Out of scope

- Product features, visual redesign, copy changes or new Git workflows.
- Changing IPC command names, payload shapes or behavior solely because files
  move.
- Changing project/session semantics, cache policies or repository freshness
  rules.
- Replacing React state/runtime architecture or introducing Redux, Zustand,
  React Query, XState or an IoC container.
- Introducing `common/`, generic `utils/`, generic `shared/types/` or another
  catch-all ownership bucket.
- Moving feature-domain types into generic shared files just to shorten import
  paths.
- Moving all frontend files into folders merely to achieve an empty `src/`
  root.
- Converting every Rust `.rs` file into a directory or mirroring frontend
  folders in Rust for visual symmetry.
- Splitting Rust modules based only on file size or line count.
- Broadly rewriting Rust APIs while auditing their physical module boundaries.

# Acceptance criteria

- [ ] The frontend root contains only deliberate entrypoints/declarations and
      no unexplained miscellaneous production modules.
- [ ] App-shell/composition code, project runtime, screen runtime, i18n runtime,
      shared UI and architecture validation have explicit, documented owners.
- [ ] `main.tsx` is replaced by or moved to the chosen app-composition path and
      `bootstrap.tsx` imports that owner cleanly.
- [ ] `screens.tsx` lives with app composition and retains one authoritative
      screen registry.
- [ ] Project runtime/session/invalidation modules live together without
      creating an ambient global current-project store.
- [ ] `screenModule` remains neutral and importable by features without causing
      a feature -> app composition dependency.
- [ ] Project switcher/avatar implementation and tests are colocated with their
      app-shell owner.
- [ ] Feature-specific root tests are moved/split into the corresponding
      feature directories, with no meaningful coverage removed.
- [ ] Cross-cutting architecture/IPC tests have an explicit architecture owner.
- [ ] `contextMenu.ts` no longer has a misleading name if it still only owns
      clipboard behavior.
- [ ] The file-icon set remains dynamically/deferred reachable as before; the
      architecture guard still fails on a static bootstrap-to-icons path.
- [ ] Existing feature public-entry-point and Tauri-adapter boundaries still
      fail loudly when violated.
- [ ] No generic catch-all source folder is introduced.
- [ ] Durable architecture documentation shows the delivered frontend tree and
      explains the runtime/app/shared distinction.
- [ ] The Rust audit records a reasoned decision for each large module reviewed.
- [ ] Any Rust module split performed by this task preserves the module's public
      API/IPC behavior and adds or updates focused tests where the new boundary
      merits them.
- [ ] If no Rust structural change is justified, the task explicitly records
      that keeping the flat Rust layout is the outcome rather than an omitted
      step.
- [ ] `pnpm run check:architecture` passes after all frontend moves.
- [ ] `pnpm run check` passes before this task is marked done.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `scripts/check-frontend-architecture.mjs`
- `src/bootstrap.tsx`
- `src/main.tsx`
- `src/screens.tsx`
- `src/screenModule.tsx`
- `src/projectRuntime.ts`
- `src/projectSessions.ts`
- `src/repositoryInvalidation.ts`
- `src/projectSwitcher.tsx`
- `src/projectAvatar.ts`
- `src/i18n.tsx`
- `src/tooltip.tsx`
- `src/contextMenu.ts`
- `src/fileIcons.ts`
- `src/architectureGuard.test.ts`
- `src/ipcContract.test.ts`
- `src/styles.css`
- `src-tauri/src/architecture.rs`
- `src-tauri/src/version_lines.rs`
- `src-tauri/src/sync.rs`
- `src-tauri/src/history.rs`
- `src-tauri/src/changes.rs`
- `src-tauri/src/clone.rs`
- `src-tauri/src/recovery.rs`

# Dependencies

None. Queue ordering places this after task 072 so the source-tree refactor does
not create avoidable path churn while session/diff hardening is still pending.

# Decisions

- Treat this as a physical ownership refactor over an already-correct modular
  architecture; do not redesign the architecture just to reorganize paths.
- Prefer named owners (`app`, `runtime/project`, `runtime/screen`, `shared/ui`)
  over a generic `common` directory.
- Keep real root entrypoints at `src/`; an empty root is not a goal.
- Colocate tests with their semantic owner except for intentionally
  cross-cutting architecture/contract tests.
- Keep the icon set as a special deferred shared module rather than exporting
  it through a broad eager barrel.
- Preserve explicit app composition instead of hiding controller wiring behind
  a container/factory abstraction.
- Keep Rust flat by default; introduce submodules only when the audit identifies
  a cohesive internal boundary with a concrete maintenance or correctness
  benefit.

# Implementation notes

Complete this during implementation. Record:

- the final before/after frontend tree;
- root files intentionally retained and why;
- tests moved or split by owner;
- architecture-guard path/rule changes;
- any import/bundle impact observed for the icon set and lazy screens;
- each Rust module reviewed and the decision to keep flat or split;
- any Rust submodule boundary introduced and why it is better than the flat
  alternative.

# Validation

During implementation, run and record at minimum:

- `pnpm run check:docs`
- `pnpm run check:architecture`
- focused frontend tests while moving owners
- focused Rust tests for any module that is split
- `pnpm run check`

Do not mark the task done unless those results are recorded truthfully.
