---
id: 118
title: Connect version-line context across Changes, History, and Lines
status: active
priority: normal
type: improvement
areas:
  - frontend
  - rust
  - accessibility
created: 2026-09-07
completed:
parent:
queue: "26"
---

# Goal

Make the active version line a piece of shared workspace context rather than a
fact each screen rediscovers on its own. The status bar becomes the one global,
persistent statement of what is being worked on and the one global way to change
it; Save Version says where the version will land; History can read a line other
than the one checked out, and can act on the lines its rows already name; and the
two navigations between Lines and History carry the line the user was looking at
instead of dropping it.

Changes, History and Lines stay three separate screens. This task does not merge
them, and does not redesign them.

# User outcome

The reader always knows which line they are on without opening Lines: the status
bar reads `Working on [icon] 0.2.0-preview.1 ▴`, and its dropdown switches lines,
creates one, or opens Lines for everything else.

Saving a version states its destination — "This version will be saved to
0.2.0-preview.1" — so the one moment where the current line actually decides
something says so.

History stops being a view of `HEAD` only. The reader can point it at a specific
local line, or at every local line at once, without checking anything out and
without touching the network. A row badged with a local line offers to view that
line in Lines, to switch to it through the same previewed flow as everywhere
else, or to start a new line from that saved version.

And the two screens stop losing the thread: opening History from `feature/foo` in
Lines opens History already scoped to `feature/foo`, and viewing a line from
History opens Lines with that line selected — in both directions without a
checkout.

# Context

Tasks 112–117 settled the shape of the three panelled screens: the shared
`.screen-header`, `--panel-column`, `--strip-height`, one strip per panel, the
list/detail pair, the breakpoints, and the type and size scales under them. What
they did not settle is how the three relate to each other, and the seams show:

- **The status bar already holds the only global line selector**
  (`VersionLineQuickSwitch` at `variant="status"`, wired in `src/app/StatusBar.tsx`),
  but it presents as a bare value with a chevron. It offers search, favourites, a
  bounded list and "see all"; it does not offer creation, and it never says what
  the value *is*.
- **Save Version never names its destination.** `SaveVersionPlan` already carries
  `branch` from Rust (`src-tauri/src/save_version.rs`) and the frontend type
  already mirrors it (`src/features/save-version/domain.ts`), and nothing renders
  it.
- **History is `HEAD`-only by construction.** `read_history_page_impl` reads
  `snapshot.head.head_commit` and walks from there; the snapshot token hashes the
  head branch, head state, head commit, upstream and shallowness
  (`compute_snapshot_token`) and the paging cursor carries that token. Task 117
  recorded this as a limit in its own out-of-scope list: "History
  follows HEAD, and the detail's copy says so rather than promising a per-line
  view that does not exist." This task builds the view.
- **The Lines → History button is context-free.** `VersionLinesPanel` renders it
  from an `onOpenHistory?: () => void` that `App.tsx` fulfils with
  `() => navigateToView("history")`, so pressing it from `feature/foo` opens the
  history of whatever is checked out.
- **History → Lines does not exist.** `HistoryRefBadge` renders a local branch
  decoration as a static `<span>` with a `title`.
- **Screens stay mounted.** `KeepAliveScreens` keeps every visited screen in the
  DOM for the session, so a contextual target passed as a prop is re-applied on
  every parent render unless it is explicitly modelled as one-shot. The codebase
  already has one precedent for that shape: `autoOpenCreate` /
  `onAutoOpenCreateHandled` between `App.tsx` and `VersionLinesPanel`.

The Git semantics constrain the History work more than the UI does. A commit does
not belong to one branch: several lines can reach the same commit, and Git cannot
cheaply answer "which line is this on". `HistoryRefBadge` already documents this
and badges only refs that genuinely point *at* a row. Scoping History to a line
therefore means *reachability from that line's tip*, never ownership, and the
wording, the data model and the badges all have to keep saying so.

# Scope

## Status bar — "Working on"

- Give the status-bar quick switch a leading label ("Working on" / "Trabajando
  en") so the strip states the context rather than only displaying a value.
- Add two entries at the end of the existing dropdown, after the results list and
  beside the current "see all": **New line**, which opens the existing create
  flow, and **Manage lines →**, which navigates to Lines. Both reuse existing
  paths — `VersionLineQuickSwitch` already accepts `onCreate`, and `App.tsx`
  already has `versionLinesAutoOpenCreate` for the create dialog.
- Keep everything the dropdown already does: search, the favourites filter and
  toggles, the bounded result list, and routing a chosen target through
  `setVersionLineSwitchTarget` so the previewed switch dialog runs.
- Keep the non-branch states as static facts. `versionLineLabel` in
  `StatusBar.tsx` already resolves detached, unborn and unavailable, and
  `canSwitch` already collapses the control to a static span; the "Working on"
  label must read correctly in front of each of them, or be replaced by wording
  that does.
- Add no second global selector. Changes and History get no line selector in
  their headers.

## Save Version — the destination

- Render the plan's `branch` in `SaveVersionDialog` as a destination statement,
  in both languages.
- Handle every case the plan can carry without inventing a name: a first version
  on a branch that has no commits yet (`isFirstVersion`), a detached `HEAD`, and
  `branch: null`. Say what is true, or say nothing about a destination.
- Read no additional Git state for this. The plan already answers it.
- Leave the switch-with-unsaved-work guarantees exactly as the version-lines
  switch flow already computes them. No automatic discard, no automatic stash, no
  silent behaviour; the dialog explains the consequence its plan states.

## History — a scope

- Add an explicit scope to the History read: the current line, one named local
  line, or all local lines.
- Surface it inside the existing search/filter strip as a "Line" control, not as a
  new bar above the panel. Default `Current line`; a chosen line reads
  `Line: feature/foo`; the union reads `All lines`. The active-scope description
  belongs with the existing filter chips so it can be cleared the same way.
- `All lines` means the deduplicated history reachable from every local
  `refs/heads/*` tip.
- Keep every existing filter native and server-side under every scope. The scope
  decides which graph is walked; the filters restrict it. Neither may be
  implemented as a predicate over the rows React is holding.
- Changing scope performs no fetch and no other network access. Publication state
  keeps using the local knowledge that already exists.

## Rust — scope, snapshots and cursors

- Extend the history read in `src-tauri/src/history.rs` with an explicit
  root/scope, resolved in Rust:
  - current: today's `HEAD` behaviour, unchanged;
  - a named local line: validated and resolved as a fully-qualified local ref
    (`refs/heads/<name>`), never a raw user string handed to `rev-list`;
  - all local lines: the tips of `refs/heads/*`, walked as one deduplicated
    history.
- Keep scope and `HistoryFilters` separate concepts. Scope selects the graph;
  filters narrow it. The exact representation is the implementer's call — a
  separate argument alongside `filters` is the obvious one — provided the two do
  not collapse into each other.
- Extend the snapshot token so it covers the scope *and* the refs/tips the read
  actually used. A branch that moves, is renamed, or is deleted mid-paging must
  produce the existing stale-snapshot error rather than a silently mixed page.
  The same applies to `All lines`: the token represents the whole set of tips.
- Keep the existing bounds: `MAX_HISTORY_PAGE_SIZE`, the capped process output,
  `MAX_CACHED_HISTORY_SNAPSHOTS`/`_COMMITS`/`_DETAILS`, and the detail budget. No
  Git process per row, and no unbounded ref enumeration — cap the tips read for
  `All lines` and report the truncation as a warning rather than silently
  dropping lines.
- Publication classification must stay correct under each scope. The windowed
  `read_local_only_commits` walk assumes a contiguous unfiltered page against a
  single upstream; under a named or all-lines scope, decide honestly whether that
  assumption still holds and fall back to the per-commit `classify_local_only`
  path, or to `Unknown`, where it does not. Do not report a publication state the
  read cannot support.
- Update `docs/architecture/025-ipc-contract.json` for the new arguments. Its
  `read_history_page` entry is already stale — task 113 added `filters` and the
  contract still lists `["path", "cursor?", "pageSize?", "sessionEpoch"]` — so
  correct that at the same time.

## History — interactive line badges

- Keep the current decoration semantics exactly: a badge means "this ref points at
  this commit", and `primaryDecoration`'s ranking is unchanged.
- Where a decoration is a real local branch, make it interactive, offering:
  - **View line** — navigate to Lines with that line selected;
  - **Switch to this line** — route through the same previewed, state-checked
    switch flow the status bar and Lines already use.
- History never performs a checkout itself.
- Tags and remote-only refs stay non-interactive: they are not manageable local
  lines and must not look like them.

## History — create a new line from a saved version

- Add a **Create new line from this version** action on a saved version.
- Extend the existing create flow rather than adding a second one: the
  `plan_create_version_line` / `create_version_line` pair already carries
  `starting_commit`, `state_token`, validation and a preview, and
  `create_version_line` already branches on `will_switch`. Give it an optional
  explicit start point and keep every guarantee — validation, preview,
  state-token check, recovery wording.
- The preview must state the starting version, the new line's name, and whether
  the project will switch to it. No silent switch.
- The action lives in History and the Git mutation stays in
  `version_lines.rs`. History does not gain a Git mutation of its own.

## Carrying context between screens

- Lines → History: opening History from a selected line scopes History to that
  line, whether or not it is the active one, without a checkout.
- History → Lines: "View line" (and the equivalent badge action) opens Lines with
  that line selected, rather than falling back to the active line.
- Model both as one-shot navigation intent, not as a standing prop. A target that
  survives as a prop will re-apply on the next `App.tsx` render and overwrite a
  selection the user has since changed by hand — which, with `KeepAliveScreens`
  holding both screens mounted for the session, is the normal case rather than an
  edge case. Follow the existing `autoOpenCreate` / `onAutoOpenCreateHandled`
  shape, or place the intent in the session navigation state in
  `src/runtime/project/sessions.ts` and clear it on consumption. Do not persist
  it: `StoredProjectsV1` holds order and active id only, and a navigation
  intention is not durable state.

## Boundaries between the screens

- Lines stays the management screen: create, rename, delete, tracking, remote
  relationships, the default line. None of that moves into History.
- History may view a line, switch to it, and create a line from a version. For
  anything else it points at Lines.
- Lines keeps its own `get_version_line_history` for the detail panel. It answers
  a different question — a bounded summary of one line — from the pageable
  timeline plus detail plus diff that History answers, and it is cached by tip.

## Accessibility and copy

- Every new menu, action and control is reachable and operable from the keyboard,
  with correct focus restoration on close.
- `aria-label`s on the new controls; tooltips where a control is icon-only.
- Long line names truncate rather than overflow, in the status bar, in the scope
  control, in the chips and on the badges.
- The status bar stays 34px (48px at the existing compact breakpoint), and the
  responsive behaviour of all three screens is unchanged.
- Every new string exists in English and Spanish.
- Colour is never the only indicator of a state.

# Out of scope

- Merging Changes, History and Lines into one screen, or moving any screen's
  responsibilities wholesale into another.
- A full commit-graph rendering. Scope changes which commits are listed; it does
  not add a graph.
- Any model in which a commit belongs to exactly one line: no `version.line`
  field, no per-row badge naming the selected scope, no ownership language.
- Fetching, or any other network access, as a consequence of changing scope.
- Treating remote-only refs as manageable local lines, or offering a scope over
  `refs/remotes/*`.
- Moving rename, delete, tracking or default-line management into History.
- A general redesign of the three screens. Tasks 112–117 settled headers, panel
  geometry, strips, list/detail layout, breakpoints and tokens; this task reads
  them.
- Replacing Lines' `get_version_line_history` summary with the full History read.
- Automatic stash or discard when switching lines with unsaved work.
- Duplicating Git logic that already has an owner: switching belongs to the
  version-lines switch flow, creation to `plan_create_version_line` /
  `create_version_line`, and the timeline to `history.rs`.

# Acceptance criteria

- [ ] The status bar reads as a stated context ("Working on" plus the line) and
      is the only global, persistent line selector in the app.
- [ ] Its dropdown still searches, filters by favourite, toggles favourites and
      routes a chosen line through the existing previewed switch, and now also
      offers New line and Manage lines, each reusing the existing flow.
- [ ] Detached `HEAD`, unborn and unavailable render as static facts, never as a
      selectable line, and the "Working on" wording reads correctly in front of
      each.
- [ ] Neither Changes nor History gains a line selector of its own.
- [ ] The Save Version dialog names the destination line from the plan's
      `branch`, in both languages, and reads correctly for a first version, a
      detached `HEAD`, and an absent branch — without a second Git read and
      without inventing a name.
- [ ] Switching lines with unsaved work behaves exactly as the existing switch
      plan states; nothing is discarded or stashed automatically.
- [ ] History reads three scopes — current line, one named local line, all local
      lines — with no checkout and no change to the working tree.
- [ ] The scope control lives inside the existing search/filter strip; the
      default is Current line, and the active scope is visible and clearable
      alongside the existing filter chips.
- [ ] `All lines` returns the deduplicated history reachable from every local
      `refs/heads/*` tip, with a bounded, reported truncation if there are more
      tips than the read allows.
- [ ] Every existing filter still runs in Git under every scope, and combining a
      scope with filters returns the same rows as the equivalent Git command.
- [ ] No commit carries a line-ownership field or a badge naming the scope;
      decorations still mean only "this ref points at this commit".
- [ ] The snapshot token covers the scope and the tips used; paging after a
      scoped line moves, is renamed, or is deleted raises the stale-snapshot
      error instead of returning a mixed page.
- [ ] Changing scope issues no fetch and no other network access.
- [ ] Existing limits hold: page size, output caps, cache bounds, detail budget,
      virtualized timeline, no Git process per row.
- [ ] A local-branch badge in History offers View line and Switch to this line;
      the switch goes through the shared previewed flow and History performs no
      checkout itself.
- [ ] Tags and remote-only refs offer neither.
- [ ] A saved version offers Create new line from this version; the preview names
      the starting version, the new name and whether the project will switch, and
      execution keeps the state token, validation and recovery semantics of the
      existing create flow.
- [ ] Open in History from a selected line in Lines opens History scoped to that
      line even when it is not the active line, without a checkout.
- [ ] View line from History opens Lines with that line selected.
- [ ] Both are one-shot: after the reader changes the target screen's own
      selection, navigating away and back does not re-apply the earlier context.
- [ ] Every new control is keyboard-operable, restores focus on close, carries an
      accessible name, truncates long line names, and exists in English and
      Spanish; colour is not the only indicator of any state.
- [ ] The status bar is still 34px, and the three screens' responsive behaviour
      is unchanged.
- [ ] `pnpm run check` passes.

# Relevant files

Read before changing anything:

- `AGENTS.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `work/done/117-lines-as-the-third-panelled-screen.md` and tasks 112–116, for
  the shape this task must not disturb

App shell and navigation:

- `src/app/App.tsx` — composition root; status-bar wiring, `KeepAliveScreens`,
  `versionLineSwitchTarget`, `versionLinesAutoOpenCreate`
- `src/app/StatusBar.tsx`, `src/app/app-shell.css`
- `src/app/screens.tsx`
- `src/runtime/project/sessions.ts` — navigation and per-session state

Version lines:

- `src/features/version-lines/VersionLineQuickSwitch.tsx`
- `src/features/version-lines/VersionLinesScreen.tsx`
- `src/features/version-lines/VersionLinesPanel.tsx`
- `src/features/version-lines/VersionLinesDialog.tsx`
- `src/features/version-lines/lineActions.ts`
- `src/features/version-lines/controller.ts`, `domain.ts`, `port.ts`,
  `tauriAdapter.ts`, `translations.ts`, `version-lines.css`

Save version:

- `src/features/save-version/SaveVersionDialog.tsx`, `domain.ts`,
  `translations.ts`

History:

- `src/features/history/HistoryScreen.tsx`, `HistoryPanel.tsx`,
  `HistoryRefBadge.tsx`
- `src/features/history/controller.ts`, `domain.ts`, `port.ts`,
  `tauriAdapter.ts`, `translations.ts`, `history.css`

Rust:

- `src-tauri/src/history.rs` — snapshot, token, cursor, `read_graph_page`,
  publication classification
- `src-tauri/src/version_lines.rs` — create/switch plans and execution
- `src-tauri/src/save_version.rs` — the plan that already carries `branch`
- `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/application.rs`
- `docs/architecture/025-ipc-contract.json`

Adjust this list if the implementation finds a more correct owner for a piece of
the work.

# Dependencies

Builds on tasks 112–117, which are complete. This task consumes the shared
`.screen-header`, `--panel-column`, `--strip-height`, the search/filter strip and
the tokens they established, and adds nothing to that set.

It also depends on the flows those tasks and their predecessors left in place:
the previewed version-line switch, `plan_create_version_line` /
`create_version_line`, `plan_save_version`, and the History snapshot/cursor
protection introduced with paging and extended by task 113's native filters.

# Decisions

**The status bar is the one global selector, and it says what it is.** A second
selector in the Changes or History header would mean two controls answering the
same question in one window, and would make the strip's value look like a
read-out rather than the control it is. Labelling it "Working on" costs one short
string and removes the ambiguity for the reader who has never noticed the strip
is interactive.

**New line and Manage lines belong in the dropdown, not in a new control.** The
dropdown is already the place lines are chosen; adding creation there means the
one control answers "which line" completely. Both entries delegate to flows that
already exist, so there is exactly one implementation of creating a line and one
of switching to one.

**Save Version names its destination from the plan.** The current line matters at
exactly one moment in Changes — when a version is written — and that is where it
should be said. `SaveVersionPlan.branch` is already computed by the same read
that produced the state token, so the dialog and the execution cannot disagree; a
second Git read could. Where the plan cannot name a line, the dialog says nothing
about a destination rather than guessing.

**Scope is reachability, not ownership.** A commit reachable from five lines
belongs to all of them, and Git will not cheaply say which line a commit is "on".
`Line: feature/foo` therefore means "the history reachable from `feature/foo`'s
tip", and the copy has to be written so a reader does not conclude otherwise. A
`version.line` field, or a badge stamping the scope onto every row, would be a
lie the data cannot support — and would contradict what `HistoryRefBadge` already
documents about decorations.

**Scope and filters stay separate.** They answer different questions: scope picks
the graph, filters narrow it. Folding scope into `HistoryFilters` would put "which
history" and "how much of it" behind one type, and the filter chips, the filter
count and `NO_HISTORY_FILTERS` would all start meaning something they do not.
Clearing all filters must not silently return the reader to the current line.

**Scope resolution happens in Rust, against a validated local ref.** A branch name
is user text, and `rev-list` takes revisions. Resolving to `refs/heads/<name>` in
Rust, validated, keeps the ambiguity between a branch, a tag and a path out of the
walk, and keeps the frontend from constructing revision syntax.

**The snapshot token grows to cover the scope and its tips.** The token exists so
a page and the pages after it describe one history. Under a scope, "one history"
depends on the refs read, not only on `HEAD` — a scoped line that moves while
paging changes the answer as surely as a moved `HEAD` does. Detecting that as
stale and re-reading is the existing, correct behaviour; extending the token is
what keeps it correct.

**Changing scope reads locally and never fetches.** AGENTS.md's rule is that a
screen becoming visible must not fetch; the same reasoning covers changing what a
screen is looking at. Remote knowledge stays whatever the last explicit check
left behind, and publication state is reported from that or reported as unknown.

**History acts on lines but does not manage them.** Viewing a line, switching to
it, and starting a new line from a version are all things a reader wants at the
moment they are looking at a row. Rename, delete, tracking and default-line
management are not, and moving them here would build a second Lines screen with
half the context.

**Creating from a version extends the existing operation.** `create_version_line`
already resolves a starting commit and already refuses a stale state token. Giving
it an explicit start point is a smaller and safer change than a second create path
inside History, and it keeps one place where a branch is created.

**Contextual navigation is a one-shot intention.** `KeepAliveScreens` keeps both
screens mounted, so a target expressed as a standing prop is re-applied whenever
the composition root re-renders — silently reverting a selection the reader made
after arriving. The intent is consumed once and cleared, following the
`autoOpenCreate` precedent, and it is not persisted, because where the reader was
heading is not durable project state.

# Implementation notes

Complete during implementation. Record at least:

- the representation chosen for scope, and why it sits where it does relative to
  `HistoryFilters`;
- what the snapshot token hashes after the change, and how a stale scope is
  detected while paging;
- how publication state is classified under each scope, including any case where
  it degrades to `Unknown`, and why;
- the cap on the number of local tips read for `All lines`, the warning that
  reports a truncation, and the measured cost of the read on a repository with
  many lines;
- where the one-shot navigation intent lives, and how it is cleared;
- any string or control that had to change shape to keep the status bar at 34px.

# Validation

Record the exact commands run and their results. Do not claim checks passed unless
they were executed successfully.

Run while writing this task (documentation only, no functional change):

- `pnpm run check:docs` — passed, over 182 Markdown files and 147 task ids.
- `pnpm run check` — passed (exit 0): documentation, frontend architecture,
  TypeScript, frontend tests and build, `cargo fmt --check`, Clippy, and 365
  Rust tests.

Tests this task must add:

Frontend

- the status bar's "Working on" rendering, including detached, unborn and
  unavailable;
- New line and Manage lines in the dropdown, each reaching the existing flow;
- the Save Version destination line, including first version, detached `HEAD` and
  absent branch;
- History under each scope: current line, a named line, all lines;
- scope combined with each existing filter, and clearing filters leaving the
  scope alone;
- the line-badge actions, including that tags and remote-only refs offer none;
- View line and Switch to this line;
- Create new line from a saved version, including the preview's contents;
- Lines → History arriving scoped, and History → Lines arriving selected;
- the one-shot property: a manual change to the target screen's selection
  survives navigating away and back;
- keep-alive state retention across navigation.

Rust

- the current-line root (unchanged behaviour);
- a named local ref root, resolved and validated;
- the all-local-lines roots, and deduplication across them;
- an invalid or non-existent ref;
- a scoped line deleted or moved between pages;
- a stale scope/snapshot token;
- paging under each scope;
- filters under a named and an all-lines scope;
- creating a branch from a historical commit;
- a stale state token during that creation.

Gate:

```bash
pnpm run check
```
