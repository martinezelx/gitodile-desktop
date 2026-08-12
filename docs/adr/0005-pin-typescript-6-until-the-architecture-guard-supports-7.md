# ADR 0005: Stay on TypeScript 6 until the architecture guard supports 7

- Status: accepted
- Date: 2026-08-12

## Context

`scripts/check-frontend-architecture.mjs` is the executable half of ADR 0003's
dependency-direction decision. Task 047 found it had been inspecting **zero**
modules of `src` since task 026 created it, and epic 022 had marked "dependency
directions are enforced automatically" complete on that basis.

The cause is a toolchain incompatibility, not a bug in the script.
`dependency-cruiser` 18 is built against TypeScript 5's JavaScript compiler API.
TypeScript 7 is the Go rewrite, and dependency-cruiser cannot load it. It does
not fail — it degrades:

- it does not recognise `.ts`/`.tsx` as source files, so a directory target
  expands to nothing;
- it cannot see `import type`, so `tsPreCompilationDeps` is inert and every
  erased edge looks like a runtime edge.

Task 047 shipped two workarounds: an explicit glob, and a classifier that read
import statements to decide which edges compile away. Both worked. Both were
maintenance surface on a control that is supposed to be trustworthy, and the
classifier needed a correctness fix within a day — multi-line `import type`
statements, the house style for long lists, were silently classified as runtime
edges for 22 imports.

Measured, in an isolated probe and then against this repository:

| dependency-cruiser | TypeScript | modules from a directory target | `type-only` reported |
| --- | --- | ---: | --- |
| 18.1.1 | 7.0.2 | 0 | no |
| 18.2.0 | 7.0.2 | 0 | no |
| 18.1.1 | 6.0.3 | 205 | yes |
| 18.2.0 | 6.0.3 | 205 | yes |

TypeScript is the only variable that matters. Upgrading dependency-cruiser
changes nothing on TypeScript 7, and the previously pinned 18.1.1 already worked
on TypeScript 6.

The codebase compiles unchanged on TypeScript 6.0.3. A forced full typecheck
costs **4.5 s** against **2.0 s** on TypeScript 7.

## Decision

Pin `typescript` to the 6.x line and keep it there until `dependency-cruiser`
supports TypeScript 7.

Both task-047 workarounds are retired. The guard cruises the `src` directory
directly, and type-only edges come from dependency-cruiser's own
`dependencyTypes`.

One aggregation rule is load-bearing and must not be simplified away: **an edge
is erased only if every import of it is type-only.** dependency-cruiser emits
one record per import statement, so a specifier imported both ways —
`import { useEffect } from "react"` beside `import type React from "react"` —
arrives as two records and only one carries the flag. Reading either record
alone would erase an edge the bundler still follows, which is the direction that
hides a real cycle or a real static path to the icon set.

The cruised-module floor stays. The guard asserts a plausible module count and
prints it, because the failure this ADR exists to prevent was silent.

`dependency-cruiser` is also moved to 18.2.0. That is independent of the
incompatibility and was taken on its own merits; it was applied and verified
after the TypeScript change, not bundled with it.

## Consequences

### Positive

- The guard inspects 205 real modules and fails on a real violation, verified by
  seeding one and watching it fail.
- Type-only classification comes from the compiler rather than from a regex this
  project maintains.
- 88 barrel cycles that never existed at runtime stay unreported, without a
  homemade classifier deciding which.

### Negative

- A full typecheck is 2.5 s slower, and the project sits one major version
  behind the current compiler.
- TypeScript 6 is the last JavaScript-based line. It will stop receiving
  features, and eventually fixes, before 7 does.
- Anything that needs a TypeScript 7-only capability is blocked until this is
  revisited.

### Exit condition

Return to TypeScript 7 when `dependency-cruiser` can load its compiler API —
verifiable in ten minutes by installing both in a scratch project and cruising a
directory containing one `import type`. Until then this stays deliberate,
recorded debt.

If that support does not arrive and a TypeScript 7 capability becomes necessary,
the alternative is to replace dependency-cruiser rather than to reinstate the
workarounds. That would be a new ADR.

## Alternatives considered

### Keep TypeScript 7 and keep the workarounds

Rejected. It preserves compile speed at the cost of a homemade classifier on the
control that enforces architecture. That classifier had two defects in its first
two days — one-line-only matching, and per-edge versus per-record aggregation —
and both were the kind that fail silently. The 2.5 s saved is not worth
re-learning that lesson.

### Upgrade dependency-cruiser and stay on TypeScript 7

Rejected because it does not work. 18.2.0 cruises zero modules on TypeScript 7,
measured before this decision rather than assumed.

### Replace dependency-cruiser with a TypeScript 7-native tool

Not chosen now. It is a larger change than the problem currently justifies, and
the guard's rules are repository-owned rather than tool-owned, so the migration
stays available later at roughly the same cost. Revisit if the exit condition
above proves unreachable.
