---
id: 049
title: Resolve the TypeScript 7 incompatibility instead of working around it
status: active
priority: high
type: chore
areas:
  - frontend
  - architecture
  - platform
created: 2026-08-12
completed:
---

# Goal

Put the toolchain back on a combination where the architecture guard works
natively, and delete the two workarounds task 047 had to write to keep it
running on TypeScript 7.

# User outcome

No visible change. The guard that protects dependency direction stops depending
on a homemade classifier and a hand-picked glob, both of which have already
needed a bug fix each.

# Context

`dependency-cruiser` cannot load TypeScript 7's compiler API — it is built
against TypeScript 5's, and TypeScript 7 is the Go rewrite. It does not fail; it
degrades. Two symptoms, one cause:

1. It does not know `.ts`/`.tsx` are source files, so a bare `src` directory
   expands to **zero modules**. That is why every rule passed vacuously from
   task 026 until task 047.
2. It cannot distinguish `import type`, so `tsPreCompilationDeps` is a no-op and
   every erased edge looks like a runtime edge.

Task 047 worked around both: an explicit glob, and a classifier that reads
import statements to decide which edges compile away. That workaround has now
needed one correctness fix of its own — multi-line `import type` statements were
classified as runtime edges, silently, for 22 imports.

## The experiment

Measured in an isolated probe and then against this repository:

| dependency-cruiser | TypeScript | modules from bare `src` | `type-only` emitted |
| --- | --- | ---: | --- |
| 18.1.1 (pinned) | 7.0.2 (current) | 0 | no |
| 18.2.0 | 7.0.2 | 0 | no |
| 18.1.1 (pinned) | 6.0.3 | 3 | yes |
| 18.2.0 | 6.0.3 | 3 | yes |

**TypeScript is the only variable that matters.** Upgrading dependency-cruiser
to 18.2.0 changes nothing on TypeScript 7, and the pinned 18.1.1 already works
correctly on TypeScript 6. The upgrade is optional and independent.

Against this repository on TypeScript 6.0.3: a bare `src` cruises **205
modules** and dependency-cruiser reports **109 `type-only` edges** of 444
natively.

The codebase compiles unchanged under TypeScript 6.0.3. A forced full
typecheck took **5.5 s** against **2.0 s** on TypeScript 7 — 2.75× slower, and
3.5 seconds in absolute terms.

## One finding that changes the plan

Do **not** simply swap the homemade classifier for the native flag. Comparing
the two over all 444 edges: 439 agree, 0 where the homemade one wrongly claims
type-only, and **5 where dependency-cruiser claims `type-only` for an edge that
is plainly a runtime import**:

```text
src/shared/ui/modalFocus.ts -> react
  import { useEffect, useRef } from "react";   <- value
  import type React from "react";
```

Same pattern in `PublishDialog.tsx -> ./controller`, `ChangesPanel.tsx ->
../status`, `SaveVersionDialog.tsx -> ./controller` and
`architectureGuard.test.ts -> ../scripts/check-frontend-architecture.mjs`. When
one specifier is imported both ways, the native flag is wrong, and wrong in the
dangerous direction: it would hide a real runtime edge, which is how a genuine
cycle or a real static path to `fileIcons` gets missed.

So the safe rule stays "type-only only if **every** import of that specifier is
type-only", and the native data should confirm the homemade classifier rather
than replace it.

# Scope

- Move `typescript` to `6.0.3` and verify the codebase compiles unchanged.
- Decide `dependency-cruiser` 18.2.0 separately, on its own merits; it is not
  required by this change.
- Drop the explicit `SOURCE_GLOB` workaround if a bare `src` is equivalent, or
  keep it and say why. Keep the cruised-module floor either way — it is what
  makes a future regression loud.
- Keep the homemade type-only classifier, and add a check that it and the native
  `type-only` flag agree except for mixed same-specifier imports. A new
  disagreement is a signal, not noise.
- Re-run task 047's triage from scratch on the new toolchain and confirm it
  still reports zero violations; record the module and edge counts.
- Record the compile-time cost, and the condition for going back to TypeScript
  7, in an ADR — this is deliberate, temporary debt, not a preference.

# Out of scope

- Changing any application code to suit the compiler. If the codebase does not
  compile under 6.0.3, stop and report rather than reshaping code around a
  tooling constraint.
- Replacing dependency-cruiser. If the answer turns out to be a different tool,
  that is a new ADR and a new task.

# Acceptance criteria

- [ ] `typescript` is `6.0.3`, `pnpm run typecheck` passes with no source
      changes, and the measured cost is recorded.
- [ ] The guard cruises the real module graph with no glob workaround, or the
      glob is kept with a recorded reason.
- [ ] The cruised-module floor still fails loudly if the target stops matching.
- [ ] Type-only classification is cross-checked against the native flag, with
      the mixed-import disagreements understood and covered by a test.
- [ ] Task 047's triage rerun reports zero violations; counts recorded.
- [ ] An ADR records the downgrade, its cost, and what would let the project
      return to TypeScript 7.
- [ ] Full `AGENTS.md` validation passes, and CI is green on all three runners.

# Relevant files

- `package.json`, `pnpm-lock.yaml`
- `scripts/check-frontend-architecture.mjs`, `.dependency-cruiser.mjs`
- `src/architectureGuard.test.ts`
- `docs/adr/`

# Dependencies

Task 047, which produced the diagnosis and the workarounds this removes.

Task 043 should run after this one: it documents what the guards enforce, and
that description changes here.

# Decisions

- The downgrade is justified by the guard, not by the compiler. TypeScript 7 is
  the faster and more current choice; the 3.5 s it saves on a full typecheck is
  worth less than an architectural control that has already spent two months
  enforcing nothing. Revisit the moment dependency-cruiser supports TypeScript
  7.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set, and record the cruised module count,
edge count and native `type-only` count so the new baseline is reviewable.
