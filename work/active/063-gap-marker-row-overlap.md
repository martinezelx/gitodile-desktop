---
id: 063
title: Stop the gap marker overlapping the line under it
status: active
priority: low
type: bug
areas:
  - frontend
created: 2026-08-15
completed:
---

# Goal

Make the "N unchanged lines" marker occupy the height it actually renders at,
so the diff line after it is not drawn 7px on top of it.

# User outcome

The chip that opens a collapsed gap stops being clipped along its bottom edge.

# Context

Found while verifying task 058 against a real virtualized diff in the browser.
It is not caused by that task: it reproduces with every reading preference at
its default, and identically with wrapping on and off, so no preference
influences it.

`ESTIMATED_MARKER_ROW_HEIGHT` in `DiffResultView.tsx` is `32`. A marker row
measures **39.25px** in the current theme — 27.25px for
`.diff-hunk__marker` plus its own 6px vertical margins, which do not collapse
out because `.diff-row` is absolutely positioned and therefore establishes a
block formatting context.

Measured across four scroll depths and both wrap modes, the row after every
marker sits exactly −7.25px from the marker's bottom edge. The constant
difference is the whole story: `39.25 - 32 = 7.25`.

What is not yet explained is why `measureElement` does not correct it. Every
row carries `ref={virtualizer.measureElement}` and `measureDiffRowHeight` does
account for the row's own `margin-top`, so the measured value should replace
the estimate. Ordinary line rows *are* contiguous to the pixel, so measurement
is working for them. Establishing why the marker row keeps its estimate is the
first step of this task, not an assumption to code around.

# Scope

- Find out why the measured height of a marker row does not replace its
  estimate.
- Fix the overlap at its cause. If the cause turns out to be the estimate
  alone, derive it from the same CSS the marker uses rather than hardcoding a
  second magic number that can drift again.

# Out of scope

- The reading preferences from task 058.
- Any other virtualizer tuning — `overscan`, the wrap estimate, or the
  split-view gutters.

# Acceptance criteria

- [ ] The row after a gap marker starts at the marker's bottom edge, measured
      at several scroll depths and in both wrap modes.
- [ ] The marker chip is not visually clipped.
- [ ] Whatever the estimate ends up being, changing the marker's CSS padding
      or margin does not silently reintroduce the drift.
- [ ] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
  (`ESTIMATED_MARKER_ROW_HEIGHT`, `measureDiffRowHeight`)
- `src/features/changes/changes.css` (`.diff-hunk__marker`, `.diff-row`)

# Dependencies

None. Predates task
[058](../done/058-diff-reading-preferences.md), which is where it was noticed.

# Decisions

Record task-specific decisions and why they were made.

# Implementation notes

Complete this section during implementation. Mention important files changed,
trade-offs, migrations, and follow-up work.

# Validation

Record the exact commands run and their results. Do not claim checks passed
unless they were executed successfully.

The diff viewer cannot be reached in a plain browser (opening a project needs
Tauri) and renders nothing under jsdom (the `ResizeObserver` stub in
`testSetup.ts` never fires, so the virtualizer never learns its viewport
size). Task 058 verified it with a throwaway Vite entry that mounted
`DiffResultView` with a generated 40-hunk diff; rebuild one rather than
claiming this from reasoning alone.
