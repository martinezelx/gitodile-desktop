# 0.4.1 — Fast, stable checks

## Goal

Close the 0.4.1 release by making the test suites and the completion gate fast
and stable before 0.5.0 work starts, and leave a test rule in `AGENTS.md` so
the suites stay in proportion.

## Queue

| Queue | Task | Outcome |
| --- | --- | --- |
| 01 | [207](207-test-suite-cleanup-and-speed.md) | Make the test suites fast, stable and governed by a test rule |

## Exit condition

Task 207's acceptance criteria are met and `pnpm run check` passes; 0.5.0
starts from the faster gate.
