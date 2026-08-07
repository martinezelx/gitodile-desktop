---
id: 026
title: Build the frontend feature runtime and screen-module contract
status: active
priority: high
type: chore
areas:
  - frontend
  - architecture
  - accessibility
  - performance
created: 2026-08-01
completed:
---

# Goal

Create the frontend composition, state subscription and screen lifecycle
contracts that future features can consume without adding orchestration to
`main.tsx`.

# User outcome

Navigation stays instant and accessible as new screens are added, without
hidden work or repository reads caused by visiting a screen.

# Scope

- Reduce `main.tsx` toward providers, shell composition, project/session
  selection and top-level dialogs; do not migrate feature workflows yet.
- Place a dependency-neutral `ScreenModule` contract outside feature modules
  and let the app registry collect feature-owned descriptors.
- A functional descriptor owns stable id, translated labels, icon/section,
  project requirement, container, lifecycle/eviction policy, accessibility
  metadata and optional performance budget.
- Use one source of truth for the lazy component loader and its primary preload;
  declare only genuinely additional chunks separately.
- Make registration automatically cover expanded/compact navigation, command
  palette, idle preload, project guard, keep-alive, accessibility hiding and
  profiling.
- Define explicit `active`, `hidden` and `evicted` lifecycle semantics. Hidden
  screens retain local UI state but suspend polling, costly effects and direct
  store subscriptions; activation synchronizes with the current snapshot
  without treating visibility as invalidation.
- Select and implement the ADR-approved selector-capable state approach with
  atomic snapshots and React StrictMode behavior. Avoid ambient access to a
  different project session.
- Add CI dependency-direction checks that understand type-only, dynamic and
  test edges and fail on new production cycles.
- Add a new-screen implementation guide and minimal test module.

# Out of scope

- Moving Version lines or other feature data lifecycles; task 027 is the pilot.
- Fetching merely because a screen became active.
- Introducing a general frontend framework inside GitOdrile.
- Splitting CSS or translations; task 030 owns that work.

# Acceptance criteria

- [ ] `main.tsx` contains shell composition but no new feature-specific request
      lifecycle.
- [ ] Duplicate or incomplete functional screen descriptors fail tests/compile.
- [ ] Lazy load and primary preload cannot refer to different modules.
- [ ] Minimal screen test proves first-visit lazy mount, idle preload, warmed
      identity, `hidden`/`inert`, project eviction and no arrival IPC call.
- [ ] The runtime exposes an activation/invalidation-owned, idle-deferred path
      for speculative cache warming; visibility alone never starts
      `read_working_tree_diffs` or another repository read.
- [ ] Internal timer/store updates prove a hidden screen does not poll,
      announce or rerender; it synchronizes correctly on activation.
- [ ] Selector tests prove unrelated project/feature state does not rerender an
      active or inactive screen and does not tear under concurrent rendering.
- [ ] Import-direction guard finds a seeded forbidden edge and reports a clear
      owning-module error.
- [ ] First-paint ordering and current chunk split remain within task 023's
      budgets.

# Relevant files

- `src/main.tsx`
- `src/screens.tsx`
- `src/projectSessions.ts`
- `src/main.test.tsx`
- `docs/ARCHITECTURE.md`
- ADR from task 023

# Dependencies

Tasks 023 and 025.

# Decisions

- `hidden`/`inert` is accessibility state, not effect suspension.
- Lazy loading and primary preloading share one loader declaration.
- Feature descriptors depend on a neutral contract; features do not import the
  app composition root.

# Implementation notes

Record the state mechanism, screen contract, import guard, lifecycle semantics
and before/after render measurements.

# Validation

Run focused screen/store/import tests, then all frontend checks.
