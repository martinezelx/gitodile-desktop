---
id: 126
title: Work is one screen, with Changes and History as its two tabs
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-21
completed: 2026-09-21
parent:
queue:
---

# Goal

Fold the Changes and History screens into one screen — **Work** in the rail,
`workbench` in the registry — switched by a pair of tabs at the head of the list
panel, the way GitHub Desktop heads its sidebar. The tabs take the row the two
screens' titles held; nothing else about either panel's shape changes.

# User outcome

What has changed and what has been saved are one place: a reader moves between
the file list and the timeline with one click on the panel they are already
looking at, and the rail has one destination for the loop instead of two
neighbours that had to be kept looking alike. Back and Forward still move
between screens; the tab is remembered per project, so leaving for Lines and
coming back lands on the tab that was open.

# Context

Tasks 112–125 gave the two screens one shape — one list column, one strip per
panel, one card header, one diff toolbar, one find — until the only thing that
told them apart was the rail entry and the word in the header. Two screens that
agree on everything are one screen with two views, and the header row each
panel already carries has room for the pair.

Constraints that shaped the decisions below:

- **The rail's width is a measurement, not a choice** (DESIGN.md § Navigation
  rail): 64px holds the widest destination label, "Overview", at 46px.
  "Workspace" measures ~54px in the rail's type and would break mid-word, and
  "workspace" is already the plain-language word for a version line in
  AGENTS.md's vocabulary table. The destination is **Work / Trabajo** (26px /
  37px); the registry id is `workbench`, the name the task series had been
  using for this pair of screens, and one that does not collide with the
  `.workspace` content region.
- **The header carried more than the title.** Changes' header held the
  include-everything checkbox and the state line (category breakdown, line
  totals, partial selection); History's held the scope chip. Two equal tabs fill
  the row, so those move to a state row under the search strip — the "3 changed
  files" row GitHub Desktop puts under its tabs.
- **Nothing is counted twice** (DESIGN.md § Core screens): the Changes tab
  carries no count badge; the status bar and the Journey band already say it.
- **A screen that is not showing must be quiet** (frontend-feature-guide): the
  inactive tab keeps its DOM, hidden and inert, under its own lifecycle
  controller derived from the screen's, so it suspends polling and announcements
  exactly as a hidden screen does.

# Scope

Registry and shell:

- A `workbench` feature owns the screen: the module descriptor (label `Work`,
  the Changes glyph, preloads for both panels' chunks), the tab pair, and the
  per-tab keep-alive slots. `ProjectView` becomes `overview | workbench |
  version-lines`.
- Each project session remembers its tab. `navigateToView("changes")` and
  `("history")` become "open Work on this tab": the Journey band's tiles,
  Lines' "view on History", the notification's "review changes", the palette's
  `Go to Changes` / `Go to History`, and the sync dialog's hand-off all route
  through it.
- Stored navigation preferences migrate: `changes` becomes `workbench` in
  place and `history` drops out; the order that shipped with History under
  Changes joins the superseded-orders list.
- The contextual palette commands (`Refresh history`) key off the tab, not the
  view.

Tabs:

- A `tablist` of two `tab`s, each half the panel's width, at `--strip-height`.
  The active one is in the primary colour with a 2px accent rule along the
  header's bottom edge; the inactive one in the secondary colour, same size and
  weight so nothing shifts on switch. Left/Right and Home/End move between them;
  the panel below is the `tabpanel`.
- One visually hidden `h1` names the active view; the panels' own `h1`s go.

Changes:

- The list panel's header is the tab pair. The include-everything checkbox and
  the state line move to a state row under the search strip, the checkbox at
  the rows' inset as before.
- Nothing to review: the list panel keeps the tabs and says "Everything is
  saved" in its state row; the empty-state block (glyph, headline, the way back
  to Overview, "Restore discarded") moves into the diff panel. In one-column
  windows the two panels stack so the block stays reachable.
- Loading and the no-working-tree case keep the tabs visible.

History:

- The timeline panel's header is the tab pair. The scope chip moves to a state
  row under the search strip and is drawn only when the scope is not the
  current line, so the timeline's first row does not move for the common case.
- Loading, error and "no saved versions yet" keep the timeline panel and its
  tabs, with the state block in the detail panel; one-column windows stack.

# Out of scope

- Any change to what either panel lists, filters, or shows in its diff.
- A count on the Changes tab.
- Back/Forward traversing tab switches.
- Renaming the Lines screen or moving it.

# Acceptance criteria

- [x] The rail shows Overview, Work, Lines, Recovery; Work opens on the
      project's remembered tab, Changes by default.
- [x] The tab pair is a keyboard-operable `tablist` at the head of the list
      panel, on both tabs and in every state of both panels (loading, error,
      empty, populated).
- [x] Switching tabs keeps both panels mounted; the hidden one is `hidden` and
      `inert`, its lifecycle is `hidden`, and it resumes on return.
- [x] Every former `navigateToView("changes" | "history")` caller lands on Work
      with the right tab, including the one-shot History scope/select intents
      from Lines.
- [x] Stored navigation preferences with `changes`/`history` adopt `workbench`
      in place; the superseded default order adopts the new default.
- [x] Changes' checkbox and state line, and History's scope chip, live in a
      state row under the search strip; the panels' first strips still start on
      the same pixel row.
- [x] Both languages are complete; dead CSS, translation keys and screen
      modules are removed.
- [x] `pnpm run check` passes.

# Relevant files

- [`src/app/screens.tsx`](../../src/app/screens.tsx)
- [`src/app/App.tsx`](../../src/app/App.tsx)
- [`src/app/preferences.ts`](../../src/app/preferences.ts)
- [`src/runtime/project/sessions.ts`](../../src/runtime/project/sessions.ts)
- [`src/runtime/screen/module.tsx`](../../src/runtime/screen/module.tsx)
- [`src/features/workbench/WorkbenchScreen.tsx`](../../src/features/workbench/WorkbenchScreen.tsx)
- [`src/features/workbench/WorkbenchTabs.tsx`](../../src/features/workbench/WorkbenchTabs.tsx)
- [`src/features/workbench/workbench.css`](../../src/features/workbench/workbench.css)
- [`src/features/changes/ChangesPanel.tsx`](../../src/features/changes/ChangesPanel.tsx)
- [`src/features/changes/changes.css`](../../src/features/changes/changes.css)
- [`src/features/history/HistoryPanel.tsx`](../../src/features/history/HistoryPanel.tsx)
- [`src/features/history/history.css`](../../src/features/history/history.css)
- [`DESIGN.md`](../../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)

# Dependencies

Builds on tasks 112–125, which made the two screens one shape.

# Decisions

- **Work, not Workspace.** The rail cannot hold "Workspace" without widening,
  and the word already means a version line in the product's vocabulary. The
  id is `workbench` for the same reason plus one: `.workspace` is the content
  region's class.
- **The tab is screen state, not a view.** One screen is one view: Back and
  Forward move between screens, as they do in GitHub Desktop, and the tab is
  session state a project keeps the way it keeps its selected file. A deep link
  from another screen sets the tab and navigates.
- **The panels keep their layouts; the workbench owns the tabs.** Rebuilding
  both screens into list/detail halves the workbench composes would have been
  the larger change for the same picture. Instead each panel takes the tab pair
  as its list header and renders it wherever it used to render its title —
  including the states that used to drop the panel altogether.
- **A state row, not a shorter header.** The breakdown, the totals and the
  partial selection are the facts a reader checks before saving; the scope is
  the fact a reader checks before trusting the timeline. They earn a row.
- **Nested lifecycle, not a second host.** The inactive tab is the same problem
  as an inactive screen, so the runtime grows one slot that derives its
  controller from the screen's, and the workbench uses it twice.

# Implementation notes

**Runtime.** `KeepAliveViewSlot` in `src/runtime/screen/module.tsx` is the
per-view twin of `KeepAliveScreenSlot`: mount on first visit, `hidden` +
`inert` afterwards, the hidden element re-rendered by identity, and a
lifecycle controller derived from the surrounding screen's (`active` only
while the screen is active and the view is shown; evicted with the screen).
`ProjectView` is `overview | workbench | version-lines`; the session carries
`workbenchTab` and a `setWorkbenchTab` action.

**Feature.** `src/features/workbench/` owns the descriptor (`navWork`,
`commandGoWork`, the Changes glyph, `additionalPreloads` for both panels'
chunks), `WorkbenchTabs` (a roving-focus `tablist`) and `WorkbenchScreen`,
which takes `renderChanges(tabs)` / `renderHistory(tabs)` render props so the
panels' wiring stays in the composition root and the workbench never imports
another feature's internals. Each view sits in its own `Suspense` whose
fallback is the list panel's shell with the tabs in its header, so the pair
does not blink out while a chunk loads. `changes/screen.tsx` and
`history/screen.tsx` are lazy containers now (`ChangesPanel` +
`preloadChangesPanel`, `HistoryScreen` + `preloadHistoryScreen`) rather than
registry entries.

**Focus across the switch.** The pair is rendered once per view, inside that
view's header, and the view that held the pressed tab is hidden the moment the
tab changes. A change made from the tabs sets a flag; the visible copy's
effect — run on every render, because the copy inside a hidden view is
frozen and never saw the change — takes focus and clears it. A change from
elsewhere (a deep link, the palette) moves focus nowhere.

**Shell.** `openWorkbench(tab)` in `App.tsx` dispatches the tab and
navigates; every former `navigateToView("changes" | "history")` goes through
it. The palette lists `Go to Work`, `Go to Changes` and `Go to History`;
`Refresh history` keys off the tab. `.workspace--workbench` replaces the two
per-screen modifiers. Stored navigation preferences run through a merge map
before the unknown-id filter (`changes → workbench` in place, `history`
dropped), and the History-under-Changes default joins the superseded orders.

**Changes.** The list panel's header is `{tabs}`; the checkbox and the
breakdown moved to `.changes-file-list__state` under the search strip, at
`--strip-height-inner` with a rule under it. Nothing to review renders the
layout with `.changes-layout--state`: the list panel keeps the tabs and says
"Everything is saved" in the state row, and `.changes-diff--state` holds the
empty block; the one-column media query stacks the two. The panel's
visually-hidden `h1` is gone — the workbench renders one for the shown tab.

**History.** The timeline header is `{tabs}`; the scope chip moved to
`.history-timeline__state`, drawn only when the scope is not the current line.
The loading, error and no-versions returns render `.history-layout--state`
with the tabs in the timeline panel and the block in `.history-detail--state`.

**Verified by hand** in a throwaway Vite harness (removed afterwards)
rendering both panels from fixtures inside the shell's workspace box, dark
theme, at 1280, 1100 and 900px: both headers 52px on the same pixel row; the
state row's checkbox at the rows' inset (x = 103 on both); the scope chip in
its own row; the clean, empty, loading and error states with the tabs in
place; the one-column stack at 900px.

**Follow-up.** The entry chunk grew 1.6 kB (580.8 → 582.4 kB minified: the
tabs, the slot and the strings). The 500 kB warning predates this task.

# Validation

- `pnpm run check:frontend` — architecture check (387 modules), `tsc -b`,
  **881 frontend tests** across 91 files, `vite build`.
- `pnpm run check:docs` — passes with the task in `done/`.
- `pnpm run check:rust` — `cargo fmt --check`, `cargo clippy -D warnings`,
  **407 Rust tests**. No Rust changed in this task.
- New tests: `KeepAliveViewSlot` (hidden view frozen, silent, resumed;
  hidden with its screen), `WorkbenchScreen` (tabs drawn by the view, hidden
  and inert sibling, keyboard shape with focus following the switch), the
  App-level keep-alive test now crosses the tabs, and the navigation
  preference migration.
