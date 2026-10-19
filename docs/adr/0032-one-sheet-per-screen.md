# ADR 0032: Put each screen's content on one sheet (Friendly Sheet)

- Status: accepted
- Date: 2026-10-18
- Replaces: the resting-card recipe as the way content is grouped (DESIGN.md
  § Visual character) and the status bar as a card of its own (§ Layout
  concept, item 3)

## Context

Every project screen spread its content over three to five cards, each
wearing the resting-card recipe: `--surface-panel`, `--border-subtle`,
`--shadow-sm` at `--radius-surface`, 16px apart, on the flat plane of the
titlebar and the rail. The recipe itself was right, but repeating it made
each screen a different board. Overview had five cards, Work and Lines two
panes and a status-bar card, and moving between them changed how many
objects the window held and where their edges were. The 16px gaps between
panes were also width the diff and the lists never got.

A style review compared 36 treatments of the same nine screens
(`work/assets/style-lab/`), from material changes (border only, shadow only,
glass) to seams (fused panels, edge to edge) and whole schools (Fluent,
Adwaita, Material). The one that kept the same material on every screen was
the frame-and-sheet layout that Arc and Dia use: the tool is a frame, and the
work sits on one rounded surface inset from the window's edge. It was then
applied to the real app with the real components and this repository's own
data, to check it outside a mock-up.

## Decision

The direction is named **Friendly Sheet**: it keeps Friendly Card's material
and replaces its structure. DESIGN.md § Visual character states it as four
rules — one frame, one sheet per screen, regions not cards, only what floats
casts a shadow — and the points below are their detail.

1. **The frame does not change.** The titlebar and the rail stay one flat
   plane on `--surface-app`, with no tint, gradient or translucency.
2. **One sheet per screen.** Column 2 of the app shell is a single sheet
   with the card's material once: `--surface-panel`, `--border-subtle`,
   `--radius-surface`. It keeps the
   same 16px of frame (`--space-4`) on all four sides — under the titlebar,
   beside the rail and to the window's edges — so it floats evenly, and as
   the one object on the plane it takes `--shadow-md`. Touching the titlebar
   and the rail with 10px only to the right and below was tried first and
   read as leaning on two edges; an even 8px read as a misalignment. Ten
   placements were compared (`work/assets/style-lab/frame-lab.html`).
3. **Inside the sheet, regions, not cards.** Overview, Work (Changes and
   History) and Lines lose the card recipe on their panels. Panels sit edge to
   edge and meet on a 1px `--border-subtle` hairline. Overview reads as three
   bands: header, next step and body. Cards *inside* a panel keep
   `--surface-card` as before.
4. **The status bar is the sheet's foot.** It keeps its three columns and its
   blocks but draws no card of its own: a hairline above it, no border, no
   shadow.
5. **Screens with their own status line do not carry the global one.**
   Console already hid it. Home now does too: its launcher ends in its own
   "This computer" row, and everything the global bar reports is about the
   open project, which Home is not about.
6. **Console and Home are the exceptions to the sheet.** Console stays a
   terminal across the workspace with its own status line, as it is today.
   Home's launcher is the one object on its screen, so it floats on the plane
   by itself, keeping its own lift (`--surface-raised`, `--shadow-md`): a sheet
   round a single card only adds a frame round the frame. The palette's
   results there take the width of Home's search field.
7. **What floats does not change.** Dialogs, Settings, menus, popovers and
   the command palette keep `--surface-raised` and `--shadow-lg`.
8. **The next step loses its elevation.** It no longer wears `--shadow-md`.
   It is still the first band under the header and keeps its glyph's
   attention halo. Its focus is its glyph: the circle is filled with the
   state's tone and the kicker takes its ink, the band's one point of colour.
   An inset card with a halo in that tone was tried first and dropped,
   because a lifted card on the sheet read as the old card recipe back again;
   eleven treatments were compared (`work/assets/style-lab/nextstep-lab.html`).

## Consequences

- Changing screens no longer changes the number or shape of the objects in
  the window: there is always one sheet, and lists and diffs gain the 16px
  the gaps took.
- What rests and what floats are easier to tell apart, because only floating
  surfaces cast a shadow inside the window.
- The status bar is no longer a separate object. Its fade over the workspace
  fades to the sheet's colour instead of the window's.
- The command palette deploys from a field, and on Home the strip's field is
  gone, so Home's status line carries the app search at its far end, the way
  Console's status line does. `Ctrl`/`Cmd`+`K` focuses it, and the results
  take that field's width instead of the palette's 480px.
- DESIGN.md § Visual character, § Layout concept (rail and status bar) and
  § Elevation change. The feature sheets for Overview, Changes, History and
  Lines drop the card recipe from their panels.
- In themes where the panel and the window are close (Tokyo Night:
  `#1a1b26` on `#16161e`), the sheet's border carries the edge. It is the
  same border the cards had there.
- In-screen notices (Changes, History, Lines, the automatic-updates and
  restore notices) had drifted across three fills — the raised surface of
  what floats, the panel the sheet itself is, and none. They are cards inside
  a region now: `--surface-card` with the subtle border. The narrow window's
  compact navigation and Get project changes' version list drop the
  `--shadow-sm` they wore at rest. `styleComposition.test.ts` keeps the sheet's
  regions flat and the notices on the inner-card fill.
- Forced colours: the panels no longer need an outline of their own, because
  the sheet's border and the hairlines are drawn in system colours.

## Alternatives considered

- **Keep Friendly Card.** Rejected for the reason in the context: the recipe
  is right, but its repetition makes every screen a different board.
- **Fused pieces (GitHub Desktop).** Panels joined with hairlines inside one
  frame per screen. Close to this decision on Work and Lines, but on Home and
  Overview it turns independent cards into table cells.
- **Edge to edge (VS Code, Sublime Merge).** Most room for the diff, but it
  gives up the capsule and radius-by-role system and reads as an expert tool.
- **Border only, shadow only, double border.** They change the material of
  every card but keep the repetition.
- **A tinted or gradient frame, as Arc does.** It would break the
  one-accent rule and make the chrome a surface again.
