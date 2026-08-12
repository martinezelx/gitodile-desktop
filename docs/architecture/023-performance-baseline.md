# Task 023 architecture and performance baseline

This document fixes the comparison point and protocol for epic 022. It is not
a claim that every number is a product SLA. Warning budgets require
investigation; failure budgets block the child task until the regression is
explained and explicitly accepted.

## Provenance

- Architecture starting commit: `bce8db0` (`fix(watch): normalize macOS event
  paths`, 2026-08-07T22:08:45Z).
- Measurement checkout: `1dac6eb`. `git diff bce8db0..1dac6eb -- src
  src-tauri` was empty; intervening commits changed planning/documentation
  only, so the production tree is identical.
- Measurement date: 2026-08-08, Europe/Madrid.
- Worktree was clean before probes. The one-off Rust timing test and external
  fixture were removed/not tracked; no probe code remains in production.

## Measurement environment

| Item | Value |
| --- | --- |
| OS | Windows 11 Home 10.0.26200, build 26200 |
| CPU | AMD Ryzen 7 7735HS, 16 logical processors |
| RAM | 15.2 GiB |
| WebView2 | 151.0.4129.72, device scale factor 1.25 |
| Node | 24.16.0 |
| pnpm | 11.17.0 |
| Rust / Cargo | 1.97.1 |
| Git | 2.55.0.windows.3 |
| Vite / React | 8.1.5 / 19.2.8 |
| Screen measurement | `tauri dev`, `VITE_PROFILE_SCREEN_SWITCHES=true`, WebView2 CDP, window compositing |

Windows is the only platform measured in task 023. ADR 0006 defers the macOS
and Linux runtime protocol to release hardening; CI compilation is not a
runtime measurement. Budgets apply per platform rather than allowing one fast
platform to average out another.

## Source and test baseline

Physical lines include blank/comment lines and were counted from Git blobs at
`bce8db0`.

| Area | Files | Physical lines | Largest files |
| --- | ---: | ---: | --- |
| Frontend production TS/TSX/CSS/d.ts, excluding the SVG | 27 | 15,478 | `main.tsx` 3,367; `styles.css` 2,945; `changes.tsx` 1,928; `i18n.tsx` 1,884 |
| Frontend tests | 16 | 4,574 | `main.test.tsx` 707; `changesPanel.test.tsx` 655 |
| Rust production (tests inside modules included in file lines) | 3 | 10,425 | `lib.rs` 9,897; `watch.rs` 521; `main.rs` 7 |

Executed test counts:

| Command | Result |
| --- | --- |
| `pnpm run test` | pass; 16 files, 206 tests |
| `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` | pass; 180 library tests, 0 binary tests |

The known sanity snapshot (206/180) was therefore independently reproduced.

## IPC and event baseline

`tauri::generate_handler!` registers exactly 30 commands. The complete
inventory, renderer call sites, operation classes and native-process shapes
are in [the dependency map](023-dependency-map.md#ipc-inventory-and-call-sites).
Twenty-nine have a production renderer caller; `app_status` is registered but
unused. Every process/filesystem command is marked `#[tauri::command(async)]`;
only the constant status and window-show commands are synchronous.

One event is emitted: `repository-changed { path,
repositoryStateChanged }`. It has no session epoch in this baseline.

## Production chunk baseline

Command: `pnpm run build`, with `VITE_PROFILE_SCREEN_SWITCHES` unset and no
Tauri debug environment. Vite transformed 1,881 modules.

| Artifact | Raw | gzip | Role |
| --- | ---: | ---: | --- |
| `index` JavaScript | 360.36 kB | 104.60 kB | entry and app shell |
| `index` CSS | 94.10 kB | 14.77 kB | global styles |
| `fileIcons` | 255.22 kB | 86.20 kB | deferred shared icon set |
| `changes` | 59.86 kB | 17.14 kB | Changes screen excluding shared icons/runtime |
| `versionLinesPanel` | 16.16 kB | 4.32 kB | Version lines screen |
| `versionLinesDialog` | 14.59 kB | 3.02 kB | branch dialogs |
| `publishDialog` | 10.04 kB | 2.68 kB | publish dialog |
| `pendingVersions` | 6.38 kB | 2.02 kB | pending versions |
| `popupMenu` | 1.83 kB | 0.82 kB | shared lazy helper |
| `jsx-runtime` | 8.40 kB | 3.20 kB | shared runtime |

The emitted static-import graph is the important relationship:

```text
index --static--> jsx-runtime
index --dynamic--> Changes/Version lines/dialog chunks and fileIcons
changes --static--> fileIcons, index, jsx-runtime, popupMenu
pendingVersions/publishDialog --static--> changes and fileIcons
fileIcons --static--> jsx-runtime
```

`fileIcons` is separately deferred because Overview uses a lazy icon and
Changes imports the set inside its own lazy screen. A migration fails if any
static path from `index` reaches `fileIcons`, even if minification happens to
hide the size increase. The architecture guard must inspect both source edge
kind and emitted chunk graph.

`tauri build --no-bundle` also passed during measurement. Its Tauri production
environment produced entry 358.00 kB, Changes 58.60 kB and `fileIcons` 255.20
kB. These are recorded for context, but future comparisons use the plain
`pnpm run build` command above unless the protocol is deliberately revised.

## Startup sequence and process baseline

The current order, confirmed from code and a desktop launch, is:

1. Entry evaluates and React mounts Overview.
2. Two nested animation frames establish that content has painted.
3. `show_main_window` shows/focuses the previously hidden native window.
4. React effects may restore stored project paths through `open_repository`
   and request status. No Git process belongs to the render/show path.
5. Only after session restoration completes, idle callbacks prefetch all
   registered chunks, start the active repository watcher and refresh branch
   inventory.
6. Screen visibility never starts a repository refresh.

Counts for an ordinary restored branch are 0 Git processes before the first
content frame, 6 for `open_repository`, 1 for the working-tree status, 2 to
establish the watcher, and 5 for the modern-Git four-branch Version-lines
inventory. The latter work is idle-deferred and asynchronous; it is not a
single startup burst before paint.

No numeric launch-duration claim is made: task 023 did not capture process
creation and first visible frame from a packaged executable on all platforms.
ADR 0006 makes that cross-platform release protocol a release-hardening gate.
The enforceable startup baseline here is ordering and zero pre-paint native
work on the measured Windows environment.

## Changes first visit and warmed revisit

### Fixture

The external local fixture was a fresh `main` repository with one commit:

- 20 tracked UTF-8 text files, 200 lines each;
- 10 tracked files with one appended line;
- 5 one-line untracked files;
- 15 changed files total, no remote, no conflicts.

It is intentionally small enough to reproduce anywhere while exercising both
the tracked batch and untracked filesystem path.

### Trigger and ownership

After Changes commits its first mount, an effect checks the session-owned
`DiffStore.batchStarted` flag and invokes `read_working_tree_diffs`. This is
speculative screen-mount work: it warms every diff, independent of which file
the user reads. In parallel, the selected file asks `diffCache.fetchDiff` for
`read_file_diff`.

Returning to Changes does not remount the screen. The existing store has
`batchStarted=true` and the selected diff is cached, so the warmed revisit
issues neither command. A new working-tree snapshot intentionally replaces the
store and pays the cost again.

### Native batch measurement

A one-off ignored Rust test called the real private command nine times against
the fixture and serialized the result with `serde_json`. The probe was removed
immediately after measurement.

| Sample | elapsed ms |
| ---: | ---: |
| 1 (cold) | 234.607 |
| 2 | 194.083 |
| 3 | 210.103 |
| 4 | 192.626 |
| 5 | 203.275 |
| 6 | 203.505 |
| 7 | 196.204 |
| 8 | 188.553 |
| 9 | 195.358 |

- all-sample median: 196.204 ms;
- nearest-rank p95: 234.607 ms;
- result: 15 `FileDiff` records, 7,731 serialized JSON bytes;
- native process cost: **4 Git processes**, corrected by the task-031 audit.
  This section originally claimed 2, counting one porcelain status and one
  "batched tracked diff". The batch was never one process: `diff_base_rev`
  runs `rev-parse --verify -q HEAD`, and `batch_tracked_diffs` makes two passes
  (`diff --name-only -z` for the ordered path list, then the patch text from
  identical flags). Reading the same function at this document's own baseline
  commit `159d25f` shows all four calls already present, so the number was a
  counting error here rather than a later regression. Untracked contents are
  still read from the filesystem with no process;
- warmed revisit: 0 batch calls, 0 selected-file calls and 0 Git processes.

The complete first Changes mount has a five-process Git cost for a selected
tracked file: the two-process batch plus the three-process selected
`read_file_diff` path. This duplication is baseline behavior, not an endorsed
target. Task 028 may consolidate it only while preserving cache correctness,
output caps and user-visible results.

### Desktop first visit

After idle chunk prefetch and project activation:

| Measure | Result |
| --- | ---: |
| click to painted Changes frame (two-rAF protocol) | 14.2 ms |
| click to selected diff text visible | 646.0 ms |
| visible descendants after diff | 332 (340 after all screens were warmed) |

This was one first-visit sample and is reported as such, not as a percentile.
The 646 ms includes selected-file Git work, the speculative batch, IPC,
parsing, React and rendering; it is not comparable to the isolated 196 ms
native batch.

## Warmed screen-switch and DOM baseline

The fixture visited every implemented screen first. The measurement then ran
20 cycles of Overview -> Changes -> Version lines -> Overview and waited two
animation frames after each click. Sixty samples were collected:

| Metric | Result |
| --- | ---: |
| p50 | 32.4 ms |
| p95 | 35.5 ms |
| min / max | 25.2 / 48.4 ms |

Per-transition medians were 33.0 ms Overview -> Changes, 32.0 ms Changes ->
Version lines and 32.6 ms Version lines -> Overview. No spinner appeared and
all three screen slots remained mounted.

Visible descendant counts after all screens were visited:

| Screen | Descendants | Rendered diff lines | Mounted/hidden slots |
| --- | ---: | ---: | ---: |
| Overview | 218 | 0 | 3 / 2 |
| Changes | 340 | 4 | 3 / 2 |
| Version lines | 73 | 0 | 3 / 2 |

This fixture does not prove large-list bounds. The budgets below therefore
include explicit rendered-row caps; task 031 used a 5,000-change fixture on
Windows, and ADR 0006 requires it when macOS/Linux release validation begins.

## Memory observation and release protocol

After visiting all screens in `tauri dev` with the profiler and remote-debug
port enabled, the GitOdrile + WebView2 process tree used 487.4 MiB working set
and 299.9 MiB private bytes. This is an intentionally instrumented debug
observation, not the release baseline used for pass/fail.

`tauri build --no-bundle` succeeded, but `cargo run --release` selected the
configured development URL; that run was excluded instead of being mislabeled
as a packaged measurement. The release memory number is therefore honestly
not available from task 023. Task 031 populated the Windows baseline; ADR 0006
requires macOS and Linux to use this protocol during release hardening:

1. Build `pnpm run tauri build -- --no-bundle` (or the current equivalent)
   from a clean checkout with the profiler and remote debugging disabled.
2. Launch the produced executable directly with no dev server.
3. Open the standard fixture, visit Overview, Changes and Version lines, wait
   10 seconds after the last repository/process activity, then sample five
   times at one-second intervals.
4. Sum the root application and its WebView children. Windows records working
   set and private bytes; macOS records resident/private footprint; Linux
   records RSS/PSS from `smaps_rollup`. Report each platform separately and
   keep the raw process list.
5. Repeat with the large DOM fixture. Report the median of the five settled
   samples and the delta from a clean Overview-only session.

## Warning and failure budgets

Budgets compare the same command, fixture, build mode and platform. A warning
requires an explanation in the child task; a failure blocks merge unless a
new ADR deliberately changes the budget.

| Measure | Baseline | Warning | Failure |
| --- | ---: | ---: | ---: |
| Git processes before first content frame | 0 | none | > 0 |
| Entry JS raw (`pnpm run build`) | 360.36 kB | > 378 kB | > 397 kB |
| Entry JS gzip | 104.60 kB | > 110 kB | > 116 kB |
| Changes own chunk raw | 59.86 kB | > 69 kB | > 78 kB |
| Version-lines panel + dialog raw | 30.75 kB | > 36 kB | > 42 kB |
| `fileIcons` raw | 255.22 kB | > 268 kB | > 281 kB |
| Static entry path to `fileIcons` | none | none | any path |
| Warm switch p50, two-rAF | 32.4 ms | > 40 ms | > 50 ms |
| Warm switch p95, two-rAF | 35.5 ms | > 50 ms | > 75 ms |
| First Changes selected diff visible | 646 ms (one sample) | > 750 ms median | > 1,500 ms p95 |
| Release all-screens process-tree memory | 221.8 MiB private (415.6 MiB working set, informational) | > 300 MiB private | > 400 MiB private |
| Visible screen descendants, standard fixture | max 340 | > 1,200 | > 2,000 |
| Rendered diff lines at once, large fixture | virtualized; standard fixture 4 | > 300 | > 500 |
| Rendered file rows at once, large fixture | bounded/virtualized contract | > 200 | > 400 |
| `read_working_tree_status` Git processes | 1 | none | > 1 |
| `read_working_tree_diffs` Git processes | 4 with tracked changes (corrected) | > 4 | > 5 |
| First Changes mount Git processes, tracked selection | 5 | > 5 | > 7 |
| Warmed Changes revisit Git processes | 0 | none | > 0 |
| Modern-Git Version-lines inventory, four branches | 5 | > 5 | > 7 |
| Settled idle Git processes after watcher quiet period | 0 | none | any repeating process |

Memory had no comparable release baseline when this table was written. Task 031
measured it and revised the metric: summed working set double-counts pages
shared across a seven-process WebView2 tree, so an Overview-only session already
read 405.1 MiB while keep-alive for all three screens added only 10.5 MiB. The
budget is now stated in private bytes, which responds to GitOdrile's own
allocations. See [ADR 0004](../adr/0004-measure-desktop-memory-as-private-bytes.md)
for the measurement rules; scope every sample to the app's own process tree and
confirm a single running instance.

## Task 031 closing measurements

Windows 11, release build (`pnpm tauri build --no-bundle`), remote debugging
port enabled for navigation, standard fixture unless noted.

| Measure | Budget | Result | Verdict |
| --- | --- | ---: | --- |
| Warm switch p50, 60 samples | warn > 40 ms | 30.4 ms | pass |
| Warm switch p95, 60 samples | warn > 50 ms | 31.8 ms | pass |
| First Changes selected diff visible | warn > 750 ms | 427 ms | pass |
| Warmed revisit Git processes | fail > 0 | 0 | pass |
| Visible descendants, standard fixture | warn > 1,200 | 340 | pass |
| Rendered diff lines, standard fixture | warn > 300 | 4 | pass |
| Console errors | any | 0 | pass |
| Rendered file rows, large fixture (5,000 changes) | fail > 400 | 21 | pass |
| Visible descendants, large fixture | warn > 1,200 | 391 | pass |
| Warm switch p95, large fixture | warn > 50 ms | 42.2 ms | pass |
| Settled idle Git processes | fail: any repeating | 0 over ~15 s | pass |
| All-screens memory | fail > 400 MiB private | 221.8 MiB | pass |

Per-command Git process counts, invoked directly over IPC against the standard
fixture:

| Command | Budget | Result | Verdict |
| --- | --- | ---: | --- |
| `open_repository` | none recorded | 6 | new baseline |
| `read_working_tree_status` | fail > 1 | 1 | pass |
| `read_working_tree_diffs` | see correction above | 4 | pass against the corrected number |
| `read_file_diff`, tracked selection | documented 3-process path | 3 | pass |
| `get_version_lines`, single branch | warn > 5 | 5 | pass |

The large fixture's `overview -> changes` p95 of 44.3 ms exceeds the Changes
screen's own `warmSwitchWarningMs: 40` while staying under its 50 ms failure
threshold. That is a warning on a fixture with 333 times the standard fixture's
changed files, recorded rather than waived.

Before task 031's virtualization the large fixture rendered 1,000 file rows —
Rust caps the payload at 1,000 entries and React mounted every one — which
failed the 400-row budget outright.

## Task 048 closing measurements

Windows 11, plain `pnpm run build`, `VITE_PROFILE_SCREEN_SWITCHES` unset.
The before measurement used the clean `382b5ac` tree; the after measurement
used task 048's working tree. Both builds transformed 1,939/1,940 modules
respectively.

| Artifact | Before raw / gzip | After raw / gzip | Delta raw / gzip |
| --- | ---: | ---: | ---: |
| `index` JavaScript | 373.09 / 106.76 kB | 282.27 / 83.01 kB | -90.82 / -23.75 kB |
| `ChangesPanel` | 60.86 / 17.36 kB | 25.85 / 7.37 kB | -35.01 / -9.99 kB |
| `DiffResultView` | part of `ChangesPanel` | 38.91 / 12.02 kB | new named chunk |
| Changes renderer total | 60.86 / 17.36 kB | 64.76 / 19.39 kB | +3.90 / +2.03 kB |
| `fileIcons` | 255.25 / 86.23 kB | 255.25 / 86.23 kB | 0 / 0 kB |
| `index` CSS | 94.60 / 14.48 kB | 94.60 / 14.48 kB | 0 / 0 kB |

Rollup factored renderer and shared UI code into named chunks once
`DiffResultView` became part of the Changes public API, which explains the
smaller physical `index` file. The relevant contracts remain independently
green: the physical entry is below the 378 kB warning, the combined Changes
renderer is below its 69 kB warning, and the architecture guard proves there
is no static entry path to `fileIcons`. The icon chunk name still appears in
Vite's dynamic-preload map, but it is not a static import or an HTML module
preload.

The after build's HTML module-preload closure contains 17 JavaScript files and
totals 424.56 kB raw / 126.51 kB gzip. A like-for-like preload-closure total
was not captured before the extraction, so the smaller physical `index` file
must not be presented as a proven startup-transfer improvement. The new
38.91 kB renderer is intentionally in that static closure; the architectural
and failure-budget requirement here is that its 255.25 kB icon dependency is
not.

Task 048 did not change `FileListItem`, its icon loading, the file-list
virtualizer, or any CSS. A new 5,000-change desktop sample was therefore not
required by the task's conditional protocol; the existing large-fixture
virtualization test ran in the full frontend suite and retained its at-most-40
rendered-row assertion, one tenth of the 400-row failure budget.

## Reproducible desktop protocol for child tasks

1. Record commit, dirty state, OS/build, CPU/RAM, WebView version, Node, pnpm,
   Rust and Git.
2. Install with `pnpm install --frozen-lockfile`; run the complete validation
   set before performance sampling.
3. Use the standard fixture above plus a large fixture with at least 5,000
   changed paths and a diff large enough to exercise virtualization/output
   caps. Never use a private repository for trace evidence.
4. For startup, launch the no-bundle release at least 10 times. Capture process
   creation, navigation start, first content paint, native window show and
   first idle work. Report median and nearest-rank p95; keep cold run 1
   separate from warmed runs.
5. For screen switching, enable `VITE_PROFILE_SCREEN_SWITCHES=true` only in a
   development build, visit every chunk once, then collect at least 20 cycles
   of every implemented screen transition. Use the existing two-rAF metric and
   report p50/p95/max plus visible DOM counts.
6. For process counts, run only the controlled local fixture with
   `GIT_TRACE2_EVENT` directed to a temporary file, count child start events
   per operation and delete the trace after recording aggregate counts. Do
   not retain remote URLs, paths outside the fixture or environment data.
7. For Changes, clear the session by close/reopen for the cold sample; record
   batch elapsed time, selected-diff ready time, process count and serialized
   bytes. Revisit without changing the fixture for the warmed zero-process
   assertion.
8. For memory, use the release protocol above. Disable profilers, DevTools and
   remote debugging. Record Overview-only, all-screens and large-fixture
   settled samples.
9. Preserve raw numeric results in the implementing task and compare against
   this table. Phrases such as “no material regression” are not sufficient.
