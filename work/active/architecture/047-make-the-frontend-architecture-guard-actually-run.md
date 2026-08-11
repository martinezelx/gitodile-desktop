---
id: 047
title: Make the frontend architecture guard actually inspect src
status: active
priority: high
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-11
completed:
---

# Goal

Make `pnpm run check:architecture` cruise production code instead of nothing,
and resolve the violations that become visible once it does.

# User outcome

No visible change. The guard that three tasks and one ADR cite as the reason
dependency direction "is enforced automatically" starts actually enforcing it.

# Context

Task 041 discovered that `scripts/check-frontend-architecture.mjs` cruises
**zero modules** for `src`. Measured directly:

```text
with config, src            -> modules: 0
no config,  src             -> modules: 0
no config,  fixtures        -> modules: 5
src/**/*.{ts,tsx}           -> modules: 198
```

`dependency-cruiser` 18.1.1 expands a bare directory argument using its own
default extension list, which does not include `.ts`/`.tsx`. The seeded fixture
directory contains `.mjs` files, so the self-test has always passed — which is
exactly why nobody noticed the production half was inert. **Every rule in the
script has passed vacuously for `src` since task 026 created it.**

This matters beyond the script. Epic 022's criterion "Frontend and Rust
dependency directions are enforced automatically and have no production cycles"
was marked met, and ADR 0003 records `dependency-cruiser` as the accepted
mechanism. The Rust half (`architecture.rs`) is genuinely enforced; the frontend
half was not.

Switching the target to `src/**/*.{ts,tsx}` makes the guard see the code and
immediately reports findings that need triage rather than a blanket fix:

- **Type-only edges are not detected.** `isTypeOnly()` looks for
  `dependencyTypes` values `type-only`/`type-import`; this version reports
  `["local","import"]` for `import type` and never emits either. Setting
  `tsPreCompilationDeps: "specify"` did **not** help — the documented `typeOnly`
  and `preCompilationOnly` attributes were absent from all 425 dependencies.
  This needs real investigation: a resolver/config issue, or a defect in
  18.1.1.
- **Consequences of that.** `projectSessions.ts` type-imports
  `features/publish`, so the entry-to-`fileIcons` walk reports a static path
  that does not exist at runtime, and several feature-internal cycles
  (`tauriAdapter -> port`) are reported that are type-only.
- **Dynamic imports are detected correctly** (`dynamic: true`), and this one is
  a genuine design question rather than a false positive: Overview's
  `additionalPreloads` dynamically import `../publish/PublishDialog` and
  `../version-lines/VersionLinesDialog` — other features' internals. ADR 0003
  says ownership rules apply to dynamic edges. Routing them through each
  feature's `index.ts` is the obvious fix, but it changes what lands in which
  chunk, so it needs a before/after measurement, not just an edit.

Task 041 deliberately did not fix this. Triaging other features' violations
inside a task about moving primitives is how a scoped task becomes an
unscheduled migration — the failure mode epic 038's own decisions call out.

# Scope

- Change the cruise target so the guard sees `src`, and assert a plausible
  module count so a future glob typo fails loudly instead of silently passing.
- Diagnose type-only detection properly. Options to evaluate: a newer
  `dependency-cruiser`, a different `tsConfig`/resolver setting, or deriving
  type-only edges from the TypeScript compiler instead.
- Triage every violation the working guard reports. For each: fix the code, or
  record why the rule should not apply and adjust the rule with a comment
  explaining the case.
- Re-measure chunk sizes before and after any import reshaping; the entry chunk
  had 2.2 kB of headroom against the task-023 warning when this was written.
- Add a self-test proving the guard fails when `src` genuinely violates a rule,
  not only when the `.mjs` fixture does.

# Out of scope

- Weakening a rule to make a finding disappear. If a rule is wrong, say so in
  the task and change it deliberately.
- Rust's `architecture.rs`, which is genuinely enforced.

# Acceptance criteria

- [ ] `pnpm run check:architecture` cruises the real `src` module graph, and
      fails if it ever cruises implausibly few modules again.
- [ ] Type-only edges are classified correctly, or the inability to classify
      them is documented with the rules adjusted accordingly.
- [ ] Every reported violation is fixed or explicitly, individually justified.
- [ ] A seeded violation inside `src` (not only in the `.mjs` fixtures) proves
      the production half of the guard fails.
- [ ] Chunk budgets re-measured and inside task-023 limits.
- [ ] Epic 022's "dependency directions are enforced automatically" criterion is
      re-verified rather than assumed, and ADR 0003 records what the guard
      actually checked before this task.
- [ ] Full `AGENTS.md` validation passes.

# Relevant files

- `scripts/check-frontend-architecture.mjs`
- `.dependency-cruiser.mjs`
- `scripts/architecture-fixtures/`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `work/done/022-modular-feature-architecture.md`

# Dependencies

None. Should run before task 043, which documents what the guards enforce.

# Decisions

- Filed separately from task 041 rather than folded into it: the fix requires
  triaging violations across several features and a real investigation into
  type-only detection, neither of which belongs in a task about moving four
  primitives.

# Implementation notes

Complete during implementation.

# Validation

Run the complete `AGENTS.md` command set, and record the module count the guard
cruised so the number is reviewable rather than implicit.
