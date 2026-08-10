---
id: 040
title: Give Overview its own screen container and finish the composition root
status: active
priority: high
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-10
completed:
---

# Goal

Move the Overview panel out of `main.tsx` into `features/overview`, so every
functional screen owns its own container and `main.tsx` becomes a composition
root in fact rather than in intention.

# User outcome

No visible change. Overview must look and behave identically, including its
change preview, placeholder states and version-line quick actions.

# Context

Epic 022's criterion "`main.tsx` and `src-tauri/src/lib.rs` are thin composition
roots" is the one criterion the epic could not mark complete. `lib.rs` reached
762 production lines from 9,897. `main.tsx` reached 2,730 from 3,367 — task 031
extracted Settings, but Overview remains.

`features/overview/screen.tsx` declares `container: { kind: "host-owned" }` with
a comment saying the shell still composes the visual panel. Its reads already
belong to repository, status and publish controllers, so what remains in
`main.tsx` is roughly 660 lines of presentation: `OverviewPanel`,
`OverviewChangesPreview`, `OverviewPlaceholderCard`,
`OverviewVersionLineQuickActions` and their icon and label tables.

The reason it survived is worth stating: no task in 023–030 was ever assigned
the Overview screen. The migrations were organized by layer, so a screen nobody
named was nobody's job.

Overview is the first-paint screen with no project open, so this task carries a
real performance constraint the other feature migrations did not. It must stay
in the entry path — making it lazy would put a chunk fetch in front of first
paint and break task 018's guarantee. `createLazyScreenContainer` is therefore
the wrong tool here; Overview needs a container that is eager.

# Scope

- Move the Overview panel and its private subcomponents into
  `src/features/overview/`, keeping props-and-callbacks shape so it receives
  values from `App` rather than reaching for controllers itself.
- Replace `container: { kind: "host-owned" }` with a real eager container, or
  extend the screen-module contract with an explicit eager container kind if
  none fits. Prefer extending the contract over leaving one screen special.
- Move Overview-owned copy into `features/overview/translations.ts` and any
  Overview-only rules into `features/overview/overview.css`, following task
  030's namespace and cascade rules.
- Reduce `App` to shell state, project session wiring and screen composition.
- Update `docs/ARCHITECTURE.md`'s "The tree epic 022 actually produced" section
  and ADR 0003's "Observed after the task-031 audit" so they no longer describe
  a residue that is gone.

# Out of scope

- Redesigning Overview. Task 033 closed its visual contract; this is a move.
- Making Overview lazy.
- `App`'s remaining `invoke` calls for watcher and session lifecycle. ADR 0003's
  dependency matrix assigns those to the composition root.

# Acceptance criteria

- [ ] `main.tsx` contains no screen body and no feature presentation.
- [ ] Overview is registered with a real container like every other functional
      screen; no descriptor declares `host-owned`.
- [ ] Zero Git processes before the first content frame, re-measured with
      `scripts/031-cdp-probe.cjs`.
- [ ] Entry chunk stays below the task-023 warning of 378 kB raw.
- [ ] Warm switch p50/p95 and visible descendants stay inside task-023 budgets.
- [ ] Overview's existing rendered regression coverage still passes unchanged.
- [ ] Epic 022's composition-root criterion is updated from partial to met.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `src/main.tsx`
- `src/features/overview/`
- `src/screenModule.tsx`
- `docs/ARCHITECTURE.md`, `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `work/done/022-modular-feature-architecture.md`

# Dependencies

None. Task 043 documents the result and should run after this.

# Decisions

- Overview stays eager. First paint outranks module tidiness, and task 018's
  no-work-before-first-paint guarantee is an acceptance constraint, not
  optional cleanup.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set plus the task-021 warmed desktop
protocol using `scripts/031-cdp-probe.cjs`.
