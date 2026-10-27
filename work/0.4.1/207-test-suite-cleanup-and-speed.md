---
id: 207
title: Make the test suites fast, stable and governed by a test rule
status: active
priority: high
type: chore
areas:
  - frontend
  - rust
  - ci
  - docs
created: 2026-10-27
completed:
parent:
queue: "01"
---

# Goal

Cut the local completion gate and the release CI time substantially without
losing safety coverage, then add a rule to `AGENTS.md` that says when and how a
test is created or changed so the suites stop growing faster than the product.

# User outcome

Every change and every release waits less for checks, the local gate stops
failing on timeouts when the machine is busy, and agents add tests that protect
behavior instead of tests that pin copy or styling.

# Context

Measured on 2026-10-27 (Windows, 16 threads, `tauri dev` running; CI figures
from recent GitHub Actions runs). No code was changed during the analysis.

## Size and growth

| | Frontend (Vitest) | Rust |
| --- | --- | --- |
| Tests | 1,759 in 152 files | 646 (lib) + 1 integration |
| Test lines | ~36k (57% of the 63k production lines) | ~10k in `src/tests` plus in-module tests |
| Task 023 baseline | 206 | 180 |
| Local run | 139–168 s wall | 300 s run, plus ~3 min compile from scratch |

Since 2026-08-01 commits added ~72k test lines against ~139k production lines.
Small UI fixes routinely add a test (for example `b4fa946`: 6 production lines,
42 test lines). Many frontend tests pin copy or visual detail ("draws no dot",
"keeps the heart readable"); there are 184 class/style assertions.

The repository is private, so GitHub bills macOS minutes ×10 and Windows ×2.

## Frontend findings

1. **jsdom is created 161 times and is 41% of tracked time** (861 s of
   environment setup, reported by Vitest). 63 of the 72 `.test.ts` files never
   touch the DOM; together their tests run in 5 s but each pays a jsdom setup.
2. **Vitest also runs `scripts/**/*.test.mjs`.** They are `node:test` files, so
   they execute inside Vitest workers and again under `node --test` in
   `check:docs`. They include a 15 s ICNS test and 13 s / 5 s / 3 s
   release-preparation tests. The ICNS test also regenerates the same mascot
   files that `mascot.mjs --check` (9 s) already compares.
3. **Time is concentrated.** 80 tests (4.5%) take 40% of test time; 386 tests
   take 79%; ten files take 67%. `App.test.tsx` alone is 87 s (21 tests over
   1 s, one at 12.8 s), and covers screen-level behavior that belongs to
   features (Home, themes, Settings). `ConsoleScreen.test.tsx` (38 s) has 60
   `user.type` calls; 232 `userEvent.setup()` calls use the default per-key
   delay. Other slow files: `ChangesPanel` 31 s, `SettingsPanel` 23 s,
   `CloneDialog` 23 s, `BranchesPanel` 21 s, `HistoryPanel` 17 s.
4. **The suite is flaky under load.** Three consecutive runs gave 0, 24 and 10
   failures, all 5 s timeouts (`App`, `CloneDialog`, `AzureConnections`,
   `InitializeProjectDialog`).

## Rust findings

5. **Execution dominates, not compilation.** CI `cargo test` step: Windows
   ~10 min (511 s execution, 1.5 min compile), macOS 4–6 min (201 s), Linux
   ~2 min (88 s). The cost is spawning `git` processes against temporary
   repositories, which is expensive on Windows.
6. **The 38 `sync_tests` are serialized by a global `SYNC_TEST_LOCK`.** Alone
   they take 188 s; the other 608 tests take 117 s in parallel; the full run is
   300 s, so the serialized block is a tail that barely overlaps. No shared
   state that requires the lock was found (sessions and temp dirs use distinct
   labels); this must be confirmed before removing it. Expected local run
   without it: about 2–2.5 min.
7. **Slowest tests** (wall time under parallel contention): the branch
   `clean_up_*` tests and `delete_branch_keeps_a_recovery_point…` (18–31 s
   each), `console::every_read_subcommand_runs_bounded_and_inert_without_writing`
   (27 s), `console::change_tests` (20–25 s), several `core_workflow_tests` and
   `history_tests` (15–64 s). Slow tests on Windows likely mirror slow
   operations for Windows users and are worth profiling as product work too.
8. Three tests compile fake executables with `rustc` at run time
   (`github_auth.rs`, `gitlab_auth.rs`, `tests/credential_helper.rs`).
9. 55 tests take over 15 s, 93 take 5–15 s, 139 take 1–5 s, 360 under 1 s.

## CI and release findings

10. **Every release runs full CI twice**: on the release pull request and again
    on the push to `main` (~29 min), because the merge coordinator requires the
    checks on the merge SHA; then the release pipeline (~18 min).
11. `Desktop release compile` (Linux + Windows release/LTO build) runs on every
    pull request although the release pipeline builds the same artifacts.
12. Rust checks run on macOS for every pull request at the ×10 billing rate.

## Temporary-file leak

13. `%TEMP%` held **150,850 `gitodile-*` entries**. About 70k come from
    `scripts/release/*.test.mjs` (`mkdtempSync` with no cleanup:
    `gitodile-publication-*`, `gitodile-merge-release-*`,
    `gitodile-release-test-*`, `gitodile-publish-*`), doubled because those
    tests run twice. The rest come from Rust tests (`gitodile-test-*`), which
    clean up only on success because there is no RAII guard. Nothing was
    deleted during the analysis.

## Non-test check costs (local)

`check-docs` 0.5 s, `check-app-update-contracts` 0.2 s,
`node --test scripts/release` 23 s, `node --test scripts/icons` 10 s,
`mascot.mjs --check` 9 s, `check-frontend-architecture` 14 s, `tsc -b` 23 s.

# Scope

Phase 0 — infrastructure, no test removed (largest gain, lowest risk):

- Vitest: default to the `node` environment and use jsdom only where the DOM is
  needed (`.tsx` and the few DOM-using `.ts`), or evaluate
  `pool: "vmThreads"` / `isolate: false`; measure both.
- Exclude `scripts/**` from Vitest; they stay under `node --test`.
- Use `userEvent.setup({ delay: null })`, `paste` or `fireEvent.change` for long
  text in tests.
- Remove `SYNC_TEST_LOCK` after proving no shared state needs it.
- Add a temporary-directory guard that cleans up on drop in Rust test support,
  and cleanup in the release/icon script tests.
- Remove the duplicated mascot regeneration between the ICNS test and
  `mascot.mjs --check`.

Phase 1 — consolidation:

- Reduce `App.test.tsx` to cross-screen wiring (about 10–15 tests) and move
  feature behavior into each feature's tests.
- Merge overlapping cases with `it.each`; remove tests that pin copy, CSS or
  layout rather than behavior.
- Make the 20 slowest Rust tests cheaper (shared template repository created
  once and copied, fewer `git` spawns, merged overlapping scenarios) without
  dropping safety assertions.
- Fix the root cause of the timeouts instead of raising `timeout` values.

Phase 2 — the rule:

- Add a "Tests" section to `AGENTS.md` (draft below) and link it from
  `CONTRIBUTING.md` and `docs/architecture/frontend-feature-guide.md` §6.

CI changes (separate pull request to `main`, because the release coordinator
rejects `.github/` and `scripts/release/` changes on a release branch):

- Run `Desktop release compile` only on `release/*` pull requests or when
  Cargo/Tauri configuration changes, and keep the required-check list in
  `scripts/release/merge-release.mjs` consistent.
- Evaluate whether the push to `main` can reuse the pull request's checks when
  the merge tree equals the tested head, and whether macOS Rust checks can run
  only on release pull requests and `main`.

## Draft rule for `AGENTS.md`

- A test protects a behavior: a safety rule (data, history, remote), a parser
  or planner, a contract (IPC, architecture), or a bug that has regressed
  before. Copy, CSS and layout are validated in the running app or the
  browser harness, not pinned by tests.
- Choose the cheapest level: pure function, then component with a mocked port,
  then `App.test.tsx`, which is only for wiring between screens.
- Extend an existing test of the same behavior (`it.each`) before adding a new
  one. Changing or removing a behavior removes its tests in the same commit.
- Rust: parsers and planners without `git` processes; a temporary repository
  only when Git behavior cannot be proven otherwise; no global mutexes, no
  `sleep`, no `rustc` at run time; temporary directories always clean up.
- Budgets: no frontend test over 1 s and no Rust test over 5 s on Linux unless
  the test says why.
- While iterating run only the affected tests; the aggregate gate runs before
  the commit.

# Out of scope

- Removing Rust safety tests that create temporary repositories, except merging
  scenarios that assert the same thing.
- Migrating away from system Git or adding a test runner such as nextest
  without a separate decision.
- Product performance work on slow Git operations (record findings as a
  follow-up instead).
- Changing release signing, publication or tagging behavior.

# Acceptance criteria

- [ ] Before/after timings recorded for `pnpm run test`, `cargo test` and
      `pnpm run check`, measured the same way as the Context section.
- [x] Vitest no longer creates jsdom for pure-logic files and no longer runs
      the `node:test` files under `scripts/**`.
- [ ] Three consecutive local `pnpm run test` runs with the app running pass
      with no timeouts. (Three clean runs passed without the app running; not
      yet repeated with `tauri dev` open.)
- [x] `sync_tests` run in parallel, or the lock is kept with a documented
      reason.
- [ ] Rust and script tests leave no `gitodile-*` entries in the temp
      directory after a passing run.
- [x] `App.test.tsx` covers only cross-screen wiring; moved cases keep their
      assertions in the owning feature.
- [x] No safety assertion (data loss, history, remote, recovery) is lost; each
      removed frontend test is listed with its reason in the implementation
      notes.
- [ ] `AGENTS.md` contains the test rule and the linked docs reference it.
- [ ] CI changes land in their own pull request to `main`, with the required
      checks list kept consistent.
- [ ] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`, `CONTRIBUTING.md`
- `docs/architecture/frontend-feature-guide.md`
- `vite.config.ts`, `package.json`, `src/test-fixtures/testSetup.ts`
- `src/app/App.test.tsx` and the slow feature tests listed above
- `src-tauri/src/test_support.rs`, `src-tauri/src/tests/sync_tests.rs`,
  `src-tauri/src/branches.rs`, `src-tauri/src/console/`
- `scripts/release/*.test.mjs`, `scripts/icons/*.test.mjs`
- `.github/workflows/ci.yml`, `scripts/release/merge-release.mjs`

# Dependencies

None. The CI part depends on a separate pull request to `main`.

# Decisions

- Infrastructure before deletion: most of the time is lost to environment
  setup, duplication and serialization, not to the number of tests.
- Rust temporary-repository tests are the product's safety net; they are made
  cheaper, not removed.

# Implementation notes

## Phase 0 (2026-10-27)

Frontend:

- `vite.config.ts` splits Vitest into two projects. `dom` runs `*.test.tsx`
  under jsdom with the `vmThreads` pool, which keeps per-file module isolation
  but creates jsdom once per worker. `logic` runs `*.test.ts` under `node`; the
  18 `.ts` files that touch the DOM or `localStorage` opt back in with a
  `// @vitest-environment jsdom` docblock.
- `scripts/**` is no longer collected by Vitest, except
  `scripts/check-public-feedback.test.mjs`, which is written for Vitest and ran
  nowhere else. The test inventory was compared file by file against the
  baseline: nothing was lost.
- `src/test-fixtures/testSetup.ts` applies the layout stubs only where a DOM
  exists.
- Local runs use half the logical cores (`maxWorkers: "50%"`; CI keeps the
  default). On a 16-thread desktop the total stays the same, but each test runs
  without oversubscription; at full width the long component tests drifted
  past the 5 s timeout.
- `App.test.tsx`: the status-bar test that also opened the palette, What's new
  and About is split in two, with every assertion kept; the shared setup is
  `restoreProjectWithStatusBar()`.
- `issueReportFlow.test.tsx` waits for the asynchronous focus restoration
  instead of asserting it synchronously.
- Tried and rejected: `delay: null` for user-event, globally or per file. It
  saved about 4 s and exposed tests that relied on the per-step delay to see
  asynchronous updates (`ProjectSettingsPanel`, `ChangesPanel`), so it would
  trade timeouts for races.

Rust:

- `SYNC_TEST_LOCK` is gone. No fixture label or session epoch is shared
  between sync tests or with other modules; five consecutive parallel runs of
  `sync_tests` passed.
- `test_support::test_temp_root()` gives every test process its own
  `<temp>/gitodile-tests/<pid>-<start>` root and sweeps roots older than one
  hour. `unique_temp_dir`, the identity and fake-GPG helpers, and 35 fixture
  sites in module tests use it. Left on the system temp directory on purpose:
  production code, `app_updates` tests that assert real temp-directory
  semantics, `github_auth`'s current-directory assertion, the macOS `/var`
  alias test, and `tests/credential_helper.rs`, which is a separate crate.

Scripts:

- `generate-icons.test.mjs` no longer regenerates every mascot file; that
  drift check is `mascot.mjs --check` in `check:icons`.
- The `scripts/release/*.test.mjs` temp-directory cleanup cannot ride on a
  release branch (`AGENTS.md`); it goes with the CI changes in the separate
  pull request to `main`.

## Phase 1 (2026-10-27)

Measuring first changed the plan. A `git` shim that logged every invocation
counted 10,583 Git processes in one Rust run: about 2,000 are fixture setup
(`init`, `add`, `commit`); the rest are the code under test, led by 2,821
`rev-parse` calls (repository discovery spawns four per operation) and 411
`check-ref-format` calls. A Git process costs about 50 ms on Windows.

Rust:

- `published_repo_and_remote` (62 call sites plus the helpers built on it)
  builds the published repository and its bare remote once per process
  through the real publish flow, then copies the pair for every test, points
  `origin` at the copy and refreshes the copied index's stat data. About
  fifteen Git processes per call become two.
- `test_support::git_commit_series` writes a run of versions with one
  `git fast-import` instead of an `add` + `commit` pair per version. Used by
  the 205-version pagination fixture (44 s → 1.6 s), the 140-version
  unpublished-cap fixture and the ten-version branch-history fixture. The 40
  tags of the decoration-cap fixture come from one `update-ref --stdin`.
- The remaining slow tests are journeys whose cost is the code under test
  (`core_workflow_tests` about 10 s each in isolation, branch clean-up,
  history reads). They stay as they are; see the follow-up below.

Frontend:

- 32 `type` calls that entered long literal text (URLs, tokens, paths) now
  click the field and paste, which is how that text reaches the field and
  avoids a render per character. Short typed commands, where each key is the
  behavior under test (Console), still type.
- `App.test.tsx`: the eight `TitlebarMenu` tests, which render the menu alone,
  moved to `TitlebarMenu.test.tsx`.
- Removed, with the reason:
  - `App` "keeps a place for each provider whose saved connection is still
    being checked": duplicates `HomeLauncher` "holds one place per provider
    still being checked" and "holds two places when both providers are still
    being checked"; the App-level re-read is still covered by "fills in
    Home's accounts once the launch check lands".
  - The mascot CSS-class assertion in `App` "welcomes with three described
    entry points" (its `aria-hidden` assertion stays).
  - `StatusBar` "sets the project and its branch side by side, and the remote
    as one phrase" and "puts the field between where you are and the
    remote": they pinned DOM order and class names, not behavior.
- Decision: the "10–15 tests" target for `App.test.tsx` was wrong. Reading
  its remaining 40 tests, they exercise what only the composition root owns:
  keep-alive across screens, retained selection and scroll, project
  activation and refresh, stale responses after reopening, the palette
  handing focus to screens, and the shared stores behind Home. Cutting them
  to a number would remove real coverage, so they stay.
- Of the 61 tests whose assertions are mostly classes or styles, most map a
  state to a class the UI is styled by (unread, active, animating, placement)
  and stay. Only the two `StatusBar` layout pins above were pure structure.

Follow-up, outside this task's scope: the application spawns several Git
processes where one would do (four `rev-parse` calls to discover a
repository, a `check-ref-format` per name). Batching them would make both the
Rust suite and the app itself faster on Windows.

# Validation

Phase 0, measured on the same Windows desktop as the baseline (2026-10-27;
`tauri dev` not running; times vary with machine load):

| Check | Baseline | After phase 0 |
| --- | --- | --- |
| `pnpm run test` | 139–168 s; 0, 24 and 10 failures in three runs | 57–90 s; 153 files, 1,760 tests, three consecutive clean runs |
| Rust lib tests | 300 s (`sync_tests` alone 188 s, serialized) | 155–210 s (`sync_tests` alone 49 s) |
| `node --test scripts/icons/*.test.mjs` | 9.7 s | 1.7 s |
| `pnpm run check` | not measured as a whole; parts summed to roughly 9–10 min | 377 s, exit 0 |

- Vitest inventory compared file by file with the baseline JSON report: same
  tests, plus the one created by splitting the `App.test.tsx` status-bar test.
- `sync_tests` passed five consecutive parallel runs after the lock was removed.
- Temp-directory snapshot around `pnpm run check`: no new `gitodile-*` entry
  from Rust or Vitest; the 72 new entries all come from
  `scripts/release/*.test.mjs`, whose fix belongs to the `main` pull request.
- `cargo clippy --all-targets --all-features -D warnings`: pass.
- CI timing after these changes is not measured yet; it needs a pushed run.

Phase 1, same desktop and conditions:

| Check | After phase 0 | After phase 1 |
| --- | --- | --- |
| `pnpm run test` | 57–90 s | 51–54 s; 153 files, 1,757 tests, three consecutive clean runs |
| Rust lib tests | 155–210 s | 119–125 s in four runs, 646 tests |
| `pnpm run check` | 377 s | 274 s, exit 0 |

- Vitest inventory compared with the phase 0 report: the eight
  `TitlebarMenu` tests moved files, and the three tests listed in the phase 1
  notes are the only ones removed.
- The Rust inventory is unchanged (646 passed, 1 ignored).
