---
id: 118
title: Connect version-line context across Changes, History, and Lines
status: done
priority: normal
type: improvement
areas:
  - frontend
  - rust
  - accessibility
created: 2026-09-07
completed: 2026-09-08
parent:
queue:
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

- [x] The status bar reads as a stated context ("Working on" plus the line) and
      is the only global, persistent line selector in the app.
- [x] Its dropdown still searches, filters by favourite, toggles favourites and
      routes a chosen line through the existing previewed switch, and now also
      offers New line and Manage lines, each reusing the existing flow.
- [x] Detached `HEAD`, unborn and unavailable render as static facts, never as a
      selectable line, and the "Working on" wording reads correctly in front of
      each.
- [x] Neither Changes nor History gains a line selector of its own.
- [x] The Save Version dialog names the destination line from the plan's
      `branch`, in both languages, and reads correctly for a first version, a
      detached `HEAD`, and an absent branch — without a second Git read and
      without inventing a name.
- [x] Switching lines with unsaved work behaves exactly as the existing switch
      plan states; nothing is discarded or stashed automatically.
- [x] History reads three scopes — current line, one named local line, all local
      lines — with no checkout and no change to the working tree.
- [x] The scope control lives inside the existing search/filter strip; the
      default is Current line, and the active scope is visible and clearable
      alongside the existing filter chips.
- [x] `All lines` returns the deduplicated history reachable from every local
      `refs/heads/*` tip, with a bounded, reported truncation if there are more
      tips than the read allows.
- [x] Every existing filter still runs in Git under every scope, and combining a
      scope with filters returns the same rows as the equivalent Git command.
- [x] No commit carries a line-ownership field or a badge naming the scope;
      decorations still mean only "this ref points at this commit".
- [x] The snapshot token covers the scope and the tips used; paging after a
      scoped line moves, is renamed, or is deleted raises the stale-snapshot
      error instead of returning a mixed page.
- [x] Changing scope issues no fetch and no other network access.
- [x] Existing limits hold: page size, output caps, cache bounds, detail budget,
      virtualized timeline, no Git process per row.
- [x] A local-branch badge in History offers View line and Switch to this line;
      the switch goes through the shared previewed flow and History performs no
      checkout itself.
- [x] Tags and remote-only refs offer neither.
- [x] A saved version offers Create new line from this version; the preview names
      the starting version, the new name and whether the project will switch, and
      execution keeps the state token, validation and recovery semantics of the
      existing create flow.
- [x] Open in History from a selected line in Lines opens History scoped to that
      line even when it is not the active line, without a checkout.
- [x] View line from History opens Lines with that line selected.
- [x] Both are one-shot: after the reader changes the target screen's own
      selection, navigating away and back does not re-apply the earlier context.
- [x] Every new control is keyboard-operable, restores focus on close, carries an
      accessible name, truncates long line names, and exists in English and
      Spanish; colour is not the only indicator of any state.
- [x] The status bar is still 34px, and the three screens' responsive behaviour
      is unchanged.
- [x] `pnpm run check` passes.

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

## The scope, and where it lives

`HistoryScope` is `currentLine | line(name) | allLines`, declared beside
`HistoryFilters` in both languages and deliberately not inside it. It is a third
argument to `read_history_page`, and `read_snapshot` now resolves it before
anything else: the resolution produces the commits to walk from (`roots`) and the
refs that produced them (`tips`).

- current: `HEAD`'s commit, no tips of its own — `HEAD` is already hashed.
- named line: `refs/heads/<name>`, resolved through `resolve_commit`. The name is
  bounded and checked against what Git refuses in a ref name, then prefixed; it
  never reaches `rev-list` as a revision. A name that does not resolve is
  `VersionLineMissing`, a name that is not a ref name is `InvalidSelection`.
- all lines: one `for-each-ref refs/heads`, capped at `MAX_SCOPE_LINES` (500)
  and at 2 MiB of output, with the overflow reported as a `linesTruncated`
  warning rather than dropped in silence.

`read_graph_page` and `read_local_only_commits` take `&[String]` roots instead of
one `head`. Several roots are one `rev-list` invocation, so "all lines" is a
deduplicated union rather than a concatenation — the Rust test asserts the root
commit appears exactly once with three lines reaching it.

**Emptiness became a fact about the scope, not about `HEAD`.** The early return is
now `roots.is_empty()`, which is what lets a named line be read in a project
whose current line is unborn. `read_decorations` takes `Option<&str>` for the
same reason: the synthetic `HEAD` marker is only added where `HEAD` points.

## Publication is answered per scope, or not answered

The page's `upstream` is now the scope's boundary rather than always `HEAD`'s:
`HEAD`'s upstream for the current line, the named line's own upstream for a named
line, and `None` for `AllLines` — each line answers to its own upstream, and
measuring a union against one of them would be a guess dressed as a fact. Under
`AllLines` every version reads `Unknown` and `unpublishedOnly` cannot narrow,
which is the behaviour that already existed for a project with no upstream. The
windowed `read_local_only_commits` walk still runs for inert filters, now over
the scope's roots.

`branch` stays `HEAD`'s own line under every scope, because the timeline uses it
to mark which decoration is the line being stood on — which is still true when
the reader is looking somewhere else.

## The token names its scope

The snapshot token is now `<scope tag>:<hash>`, and the hash covers the scope's
tips and its truncation flag alongside what it already covered. Two consequences:

- A scoped line that moves, is renamed, or is deleted while a reader is paging
  produces a different token, so the cursor is stale and the page is refused —
  the case the old `HEAD`-only token could not see. Both are tested.
- A detail read can recover the scope from the token it was given, so
  `read_saved_version_detail` and `read_saved_version_file_diff` keep their
  existing arguments. `validate_snapshot_and_commit` parses the tag, re-resolves
  that scope, compares tokens, and checks reachability from the scope rather than
  from `HEAD`.

`decode_cursor` moved to `splitn(4, ':')` because a token now carries `:` of its
own; `:` is the separator precisely because Git forbids it in a ref name.

Reachability under a union is one process, not one per line:
`for-each-ref --contains=<commit> refs/heads` intersected with the scope's tips.
A single root still uses `merge-base --is-ancestor`.

`cached_head_is_current` became `cached_snapshot_is_current`. `HEAD` alone was a
sufficient freshness check while every history was `HEAD`'s; under a scope the
line being read can move while `HEAD` stands still, so a scoped read costs one
extra `for-each-ref` — never one per line — and the current line still costs one
`rev-parse`.

## Creating a line from a saved version

`plan_create_version_line` / `create_version_line` take an optional
`start_commit`. It must be a full object id that resolves to a commit in this
project: a revision expression would let a name, a tag or `@{upstream}` in as a
starting point, and History only ever sends what a row already holds. The state
token covers the starting point, so a preview of one version cannot be executed
against another.

Two behaviours had to be decided rather than inherited:

- **A detached `HEAD` is no longer force-switched when the line starts
  elsewhere.** Creating a line at the current commit still recovers a detached
  `HEAD` by switching onto it; creating one at an older version is not a
  recovery, and switching would move the working tree away unasked.
- **An unborn `HEAD` no longer blocks it.** A chosen saved version is a commit,
  which answers the question an unborn current line cannot.

`switch -c <name> <start>` is one operation, so the line is created at the chosen
version and checked out or neither happens.

## Where the UI put things

The scope is a group inside the existing filter panel — two capsules (Current
line, All lines) built from the radio pattern the date ranges already use, plus a
completion field for any other line, built from the pattern the author filter
already uses. A name is applied only when the project has that line, so a typo is
refused in the panel rather than sent to Git to fail. The active scope appears as
the first chip under the strip, removable like a filter but labelled as the line;
clearing every filter leaves it alone, and an empty list under a scope offers its
own way back.

The row badge could not become a button — a timeline row is itself a
`role="option"` button, and nesting one inside it is invalid. So the actions live
in two places that agree with each other through one component
(`HistoryVersionMenu`): a right-click on any row, and the local-line chips on the
detail card, which are buttons anchored to their own box so a keyboard opens the
menu in the right place. Tags and remote-only refs stay text. A line already
checked out is offered View but not Switch.

`App.tsx` owns every cross-screen hand-off, so neither feature imports the other:
History emits `onViewLine` / `onSwitchLine` / `onCreateLineFromVersion`, and the
composition root routes them to the Lines screen, the existing previewed switch
dialog, and the existing create dialog. The three callbacks are `useCallback`s
over latest-value refs, because the timeline is memoized and a new object every
render would re-render every row.

## The one-shot intentions

`historyScopeLineIntent` and `linesSelectIntent` live in `App.tsx`, are applied
once by an effect in the receiving screen, and are handed back through a
`…Handled` callback that clears them — the shape `autoOpenCreate` established.
Neither is persisted: `StoredProjectsV1` holds order and active id, and where
someone was heading is not durable state. Both screens have a test that changes
the selection by hand, re-renders, and asserts the earlier target does not come
back.

## Smaller things this touched

- `versionLinesHistoryInactiveDescription` was deleted rather than reworded. It
  said History follows the line you are on and told the reader to switch; both
  halves are now false.
- `versionLinesQuickSwitchSeeAll` reads "Manage version lines" — the dropdown now
  answers "which line" completely, and the last entry is the hand-off to the
  screen that does everything else.
- The create button beside the quick switch is scoped to `variant="control"`. The
  status strip is 34px across the whole window and its dropdown now carries the
  same action.
- `docs/architecture/025-ipc-contract.json` was already stale for
  `read_history_page`: task 113 added `filters` and the contract never followed.
  Corrected here alongside `scope` and the two `startCommit` arguments.
- New error code `VersionLineMissing`, in Rust, in the contract, in the TS union
  and in both languages.

# Validation

```bash
pnpm run check
```

Passed on the final tree (exit 0): documentation, frontend architecture,
TypeScript, 742 frontend tests, the production build, `cargo fmt --check`,
Clippy with `-D warnings`, and 378 Rust tests.

New coverage, all passing:

Rust — `src-tauri/src/tests/history_tests.rs`: a named line read without a
checkout (and `branch` still naming `HEAD`'s line); the deduplicated union under
`AllLines`, with publication reported as unknown rather than measured against one
line's upstream; a missing line answered as `VersionLineMissing` and a name that
is not a ref name as `InvalidSelection`; filters running in Git under both a
named and an all-lines scope; a cursor going stale when the scoped line moves
while `HEAD` stands still, and again when it is deleted; a cursor from one scope
refused under another; paging through a scope; and a detail read that resolves
its scope from the token and refuses a commit the current line cannot reach.

Rust — `src-tauri/src/version_lines.rs`: creating a line at a chosen saved
version without moving the project; switching only when asked; a detached `HEAD`
not being force-switched onto a line rooted elsewhere; a starting point that is
a revision expression, a name, or a commit this project does not hold being
refused; and a state token from one starting point refused against another.

Frontend — the scope in the controller (a fresh read, the retired cursor, filters
and scope surviving each other, no re-read for the scope already held); the
strip's line control, its chip, its refusal of an unknown name and its way back;
the row actions for a local line, their absence on a tag, and no offer to switch
to the line already checked out; the Save Version destination for a named line, a
first version and a detached `HEAD`; the status bar's "Working on", its New line
and Manage lines hand-offs, and the creation control staying out of the strip;
and both one-shot navigations, each asserting that a selection the reader changes
afterwards survives a re-render.

Not verified in a running app: these screens read the repository through Tauri
IPC, which a browser preview cannot exercise. Behaviour is covered by the tests
above; the visual result was not looked at.
