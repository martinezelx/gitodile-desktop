# ADR 0040: Track launch JavaScript as a trend, not a fixed budget, until 1.0

- Status: accepted
- Date: 2026-10-28

## Context

Task 023 fixed a launch budget on the `index` chunk alone: a warning above
378 kB raw and a failure above 397 kB raw (110 kB and 116 kB gzip). Its rules
say a failure blocks merge unless an ADR changes the budget.

The budget no longer measures what it was meant to. A later `vendor`
code-splitting group moved third-party code out of `index`, and shell
features kept arriving through 0.2–0.4. When task 209 re-measured launch on
2026-10-28, `index` alone was 542 kB raw. Everything the first frame loads,
`index` included, came to 1,568 kB before task 209 and 1,258 kB after it
(Spanish). The failure threshold had been crossed for several releases with
no ADR. A number that every release breaks and nobody revisits is not a
budget.

GitOdile is still before 1.0, and the roadmap adds whole features (agent-era
surfaces, more hosting providers) whose shell code legitimately enlarges the
launch graph. A fixed size chosen now would either be raised every release or
be ignored again. What regressions actually cost users is structural: native
work before the first frame, a lazy screen or dependency pulled into launch,
or both languages evaluated when one is shown.

## Decision

Until the 1.0 release-hardening pass, launch JavaScript size is a **tracked
measurement**, not a warning or failure budget:

- The measure is the total raw and gzip size of every script
  `dist/index.html` loads or preloads, plus the active language's dictionary,
  from `pnpm run build`, as the task 209 section of
  [the architecture baseline](../architecture/023-performance-baseline.md)
  defines it.
- Each release that changes the launch graph records that total in the
  baseline with its date. A growth of more than 10 % over the previous
  recorded total is explained in the task that caused it. It prompts
  investigation; it does not block.
- These structural rules stay failures, because feature growth never
  justifies breaking them:
  - no Git process before the first content frame;
  - no static path from the entry to the file-type icon set;
  - registered lazy screens stay lazy;
  - only the active language's dictionary is evaluated at launch;
  - the `vendor` group lists only libraries the shell needs at launch.

The 1.0 release-hardening pass sets fixed launch budgets again, measured from
packaged builds on every platform as ADR 0006 already requires for runtime
numbers.

## Consequences

- Feature work no longer silently violates a launch budget, and the size
  history stays visible release by release.
- Nothing stops gradual growth automatically before 1.0; the 10 % note and
  the structural rules are the guard, and reviewers have to read them.
- The task 023 entry-JS rows remain in the baseline as history, marked as
  superseded by this decision.

## Alternatives considered

- **Raise the fixed budget to today's size plus a margin.** Rejected: the
  roadmap would cross it again within a release or two, recreating the same
  silent violation.
- **Keep the old budget and move shell code out of `index` until it fits.**
  Rejected for now: a 397 kB `index` would mean deferring most of the shell
  that the first frame shows, for a cost (parsing local files) that is small
  next to the structural regressions above.
- **Drop the measurement altogether.** Rejected: without a recorded total,
  growth would be invisible until it was already a problem.
