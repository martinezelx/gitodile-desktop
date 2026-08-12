---
id: 038
title: Close out the modular architecture migration
status: active
priority: normal
type: epic
areas:
  - architecture
  - frontend
  - rust
  - performance
  - platform
created: 2026-08-10
completed:
---

# Goal

Retire the residue epic 022 left behind, so the delivered tree, the documents
that describe it and the guards that protect it all agree, and no acceptance
criterion is carried as "partially met".

# User outcome

Nothing user-visible changes. The point is that the next feature — starting with
History in task 015 — inherits an architecture whose rules are true rather than
aspirational, and whose one silent degradation path fails loudly instead.

# Context

Task 031 audited epic 022 against the final code and closed it with one
criterion partially met and five named follow-ups. Later passes over every
child task file and the code found additional residues that were not recorded
anywhere, plus one concurrent Save version backup defect that must be fixed
before the structural close-out continues.

Nothing here blocks History. The audit's greenfield proof showed a new screen
costs three registration lines in `lib.rs` and three wiring points in
`main.tsx`. These tasks exist because the epic's own stated rules — "visual
components do not invoke Tauri", "a primitive with two real consumers moves to
`shared/ui`", "every native command declares an execution policy" — are written
down but not fully applied or enforced, and rules in that state decay.

Two patterns caused most of this and are worth naming, because they will
recur:

- **Nothing was assigned an owner.** Tasks 023–030 assigned migrations by layer
  (reads, mutations, styles). Screens nobody named — Overview, Settings — and
  primitives nobody named simply survived. Enumerate the things, not the layers.
- **Scaffolding outlived the scaffold.** The strangler migration is over, but
  its compatibility fallbacks, module docs and target diagrams are still in the
  tree describing a state that no longer exists.

# Child tasks and order

| Task | Status | Outcome | Depends on |
| --- | --- | --- | --- |
| 039 | Done 2026-08-11 | A Git call without a command frame fails instead of silently getting a read policy | none |
| 040 | Done 2026-08-11 | Overview owns its screen container; `main.tsx` becomes composition-only | none |
| 041 | Done 2026-08-11 | Proven shared primitives live in `shared/ui` behind named exports | none |
| 042 | Done 2026-08-11 | Repository invalidation accepts registered subscribers instead of positional parameters | none |
| 043 | normal, not started | `ARCHITECTURE.md`, ADR 0003 and the `application.rs` header describe the delivered tree | 039–042, 044, 046–049, 051 |
| 044 | Done 2026-08-11 | The test-only screen module leaves production space and the guard can see it | none |
| 045 | high, not started | macOS and Linux desktop behavior and memory are measured | none |
| 046 | low, not started | Settings owns its styles and translations and stops costing entry-chunk bytes | 041 |
| 047 | Done 2026-08-11 | The architecture guard inspects `src` instead of cruising zero modules | none |
| 048 | low, not started | The diff renderer leaves `ChangesPanel` so the guard needs no allowance | 047 |
| 049 | Done 2026-08-12 | TypeScript 6 restores native guard support and retires task 047's workarounds | 047 |
| 050 | high, not started | Save version reserves collision-proof index backups and proves concurrent contents remain isolated | none |
| 051 | normal, not started | Overview's saved-version reads use a feature-owned Tauri adapter and the guard enforces that boundary | 049 |

050 runs first because it protects the recovery copy for a user's real Git
index. Then 051 and 048 close the two executable frontend exceptions, followed
by 046's Settings ownership work. 043 runs last of the structural tasks so it
documents the finished tree once instead of repeatedly describing intermediate
states. 045 is technically independent and remains the only task that needs
hardware this project has not used; run it as soon as that hardware is
available.

# Out of scope

- Any user-visible behavior, visual or workflow change.
- Implementing History, Recovery or conflicts.
- Reopening ADR 0003's accepted decisions. A task here may record that the
  delivered shape differs; changing the decision itself needs a new ADR.
- Splitting Rust domain files into directories. Compiler privacy and
  `architecture.rs` already enforce the boundaries; directories without
  submodules would be ceremony.

# Epic acceptance criteria

- [ ] Tasks 039–051 that belong to this epic are complete with their own
      validation recorded. Done: 039, 040, 041, 042, 044, 047 and 049.
- [x] Epic 022's partially-met "thin composition roots" criterion is satisfied
      or a new ADR records why it will not be. Satisfied by task 040.
- [x] No production code path can execute Git without an execution policy.
- [ ] Save version index backups are collision-proof across concurrent projects.
- [ ] Production feature transport imports exist only in feature-owned adapters
      and the architecture guard enforces the rule.
- [ ] Every architecture document describes the tree that exists.
- [ ] Windows, macOS and Linux desktop behavior is measured or its absence is
      an explicit, dated, owned limitation rather than silence.

# Dependencies

- Epic 022 and task 031, both complete.
- Task 015 (History) does not depend on this epic and may proceed in parallel.
  If it does, task 042 should land first so History is not added to the read
  coordinator by hand and then migrated again.

# Decisions

- Grouped as an epic rather than eight loose tasks so the migration has one
  reviewable end state, matching how epic 022 grouped tasks 023–031.
- Kept out of task 031: that task's job was to audit and report honestly, not
  to grow into the migration nobody scheduled. Fixing findings inside an audit
  is how audits stop being trustworthy.

# Implementation notes

Complete during implementation.

# Validation

Each child task runs the full `AGENTS.md` command set. Task 045 additionally
runs the task-023 desktop protocol on macOS and Linux.
