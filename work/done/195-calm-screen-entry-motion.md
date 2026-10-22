---
id: 195
title: Make screen entry immediate and start Work views consistently
status: done
priority: normal
type: refinement
areas:
  - frontend
  - design
created: 2026-10-22
completed: 2026-10-22
parent:
---

# Goal

Show available content immediately when navigating, retain useful motion and
start Changes/History at their first item in the displayed file layout.

# Approved scope

Requested directly after the animation audit, ahead of the existing queue,
on the existing `release/0.4.1` branch. The user requested one combined task,
a code review with justified fixes, the complete check gate and a commit.
The temporary task 196 was folded here before committing; its ID stays reserved.

- Remove the rail icon's entry scale, Home recent-project and Overview version
  row cascades, and Branches' first-result drawing sequence.
- Preserve Branches' 200ms branch-to-branch cross-fade and loading placeholder.
- Shorten Overview's compact restoration card fade to the normal 180ms token.
- Show Console's initial welcome drawing immediately; retain the reveal when
  a command moves it to the watermark or clearing a nonempty transcript
  restores the welcome. Revisits and empty clears do not replay the entrance.
- Preserve Home's animated prompt and once-per-session mascot greeting as the
  user requested, including the existing typing speed. Retain new-row feedback
  in Changes/History and motion for progress, menus and panels.
- Default Changes and History file lists to folders, respecting explicit saved
  flat-list choices and the existing shared preference and toggle.
- Resolve initial/missing file selections in the selected layout's order,
  rather than Git's payload order, including cached History detail.
- Generic palette, rail and tab entry selects the first file and first History
  version; particular file/version links keep their target. Refresh,
  Back/Forward and project restoration retain their existing selection semantics.
- Review the final implementation for bugs, regressions and justified improvements.

# Acceptance criteria

- [x] Available screen content has no decorative entry delay; useful motion
      and the Home exceptions above remain, including reduced motion.
- [x] Console only reveals the drawing when commands/clearing relocate it.
- [x] Both file lists default to trees and preserve a stored flat-list choice.
- [x] Initial file selection follows the layout before reading its diff.
- [x] Generic navigation resets the version/file and retained timeline scroll;
      targeted links keep their target and valid refresh selections survive.
- [x] Final code review and regression checks are recorded below.
- [x] The aggregate `pnpm run check` passes; platform validation is reported honestly.

# Platform implications

CSS motion, file-layout storage and lifecycle contracts remain shared across
Windows, macOS and Linux. No Git operations, native APIs, dependencies or
storage migrations are introduced. App/OS reduced-motion preferences still apply.

# Relevant files

- [Design rules](../../DESIGN.md)
- [Frontend guide](../../docs/architecture/frontend-feature-guide.md)

# Implementation and review

Removed unconditional entrance classes, index variables and obsolete Branches
reveal state/keyframes. ConsoleMascot accepts an entrance choice at mount;
ConsoleScreen enables it only after clearing a nonempty transcript. Its
existing lifecycle finishes interrupted reveals while hidden or under reduced
motion. Home's prompt implementation/timing is unchanged.

The shared file-layout reader accepts an explicit `list` and otherwise returns
`tree`, including unavailable storage. A shared selection policy preserves a
valid explicit path or chooses the first path in the layout. History applies
it to fresh/cached detail before a diff read. Navigation resets generic entry
without restarting the History page; explicit version/file links bypass it.
Overview passes the targeted commit through its navigation callback. Branch
scope intents choose their first version after the scoped page lands.

The review found two timing problems: an in-flight page could restore a
selection captured before navigation, and a retained scroll could remain below
the first version if its debounced offset had not been saved yet. Page arrivals
now honour the current selection. Explicit entry has a revision so retained
timelines reset even from an unchanged saved offset, cancel a pending scroll
save and unfold their version blocks. A superseded branch/version intent
cannot reapply its target after a newer scope or generic entry. Selected file
changes reveal their containing folders; Changes' initial/fallback selection
uses matching files while preserving a valid explicit selection across filters.

# Validation

- Regression coverage includes Console command/clear/revisit/reduced-motion
  behavior, tree defaults and persisted flat-list choices, folder inclusion and
  folding, fresh/cached file selection with a single initial diff read,
  palette/rail/tab entry, explicit older-version links and retained scrolling.
- Windows Tauri validation using the Computer Use skill covered Overview's
  immediate 30-version list, Console's immediate welcome and command/Ctrl+L
  reveals, revisits, Branches' first route and another branch's details, and
  Home's immediate recent rows alongside its retained greeting/typing. No
  visual/layout problems were found in those exercised flows. No Git branch
  switch was executed.
- A duplicate Vite startup found port 1420 occupied; verified the existing
  server belonged to this checkout and reused it. Closed only the temporary
  native process after validation, retaining the user's app/server.
- Later interactive validation was stopped by the user with physical Escape.
  Folder defaults and navigation selection were validated through automated
  tests; no further Computer Use was performed. macOS/Linux were not run
  interactively.
- The aggregate gate before the final review passed: all 148 frontend files /
  1,597 tests, build, docs/release/icon/architecture checks, TypeScript, Rust
  formatting, Clippy and 623 Rust library + 1 integration tests; 1 existing Rust
  test ignored. The build retains its existing 500kB chunk warning.
- Windows' running app locks the normal debug executable. Checks use the ignored
  `src-tauri/target/check-195` directory via `CARGO_TARGET_DIR` so validation
  does not close the user's app.
- Final focused review regressions: 5 files / 150 tests passed. They cover late
  refresh completion, superseded scoped version links, an unsaved scroll offset
  on a filtered timeline, revealing a selected file's folded folder, and
  missing/invalid/unavailable storage alongside explicit tree/list preferences.
- Final aggregate `pnpm run check` with
  `CARGO_TARGET_DIR=src-tauri/target/check-195`: passed (exit 0) after all review
  fixes. Docs/release/icon contracts, architecture, TypeScript, all 148 frontend
  files / 1,605 tests, production build, Rust formatting, Clippy and all-target /
  all-feature Rust tests passed: 623 library tests plus 1 credential-helper
  integration test, with 1 existing library test ignored. The build retains its
  existing chunk-size warning. No further actionable issues were found in the
  reviewed diff and exercised flows; this is not a claim of exhaustive UI or
  cross-platform validation.
- After recording the final result, documentation and diff whitespace were
  checked again before committing.
