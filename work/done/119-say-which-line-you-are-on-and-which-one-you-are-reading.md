---
id: 119
title: Say which line you are on, and which one you are reading
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-08
completed: 2026-09-08
parent:
queue:
---

# Goal

Polish what task 118 connected. The pieces work; three of them do not say enough
about themselves. The quick switch spends two full rows on its hand-offs, History
does not say which history it is reading once the filter panel is closed, and the
one control in a saved version's metadata row looks like the facts around it.

No structural change, no new screen, no new Git read.

# User outcome

The status bar still states the working context, with the line's name carrying
the weight and "Working on" reading as the sentence around it.

The quick switch is shorter: `+ New line` and `Manage lines →` sit on one row at
the foot of the popup, so the list of lines gets the height the two rows were
spending.

And the two contexts are told apart. When History is reading something other than
the current line, its caption says so — `3 saved versions loaded · Line: main` —
so the reader is never looking at one line's history while the strip names
another without knowing it.

# Context

Task 118 gave History a scope and the status bar a stated context. Using it for a
while surfaced four things, none of them structural:

- The quick switch's `New version line` and `Manage version lines` were two
  full-width menu rows, ~87px for two actions in a 292px popup.
- With the filter panel closed, nothing on the History screen said which line it
  was reading. The status bar said `Working on 0.2.0-preview.1`; History could be
  showing `main`.
- `Another line…` reads as "any line except this one". The control chooses one
  specific line.
- A chosen line looked like a filled text field. Nothing distinguished "waiting
  for a name" from "holding the line this timeline is reading".
- The saved-version metadata row ended in `Actions`, styled exactly like the
  `HEAD`, `main` and `origin/main` chips beside it — the one control in a row of
  facts, dressed as a fact.

# Scope

- Keep `Working on` and its hierarchy: secondary tier for the words, the line's
  name as the interactive fact. No second selector anywhere.
- Put the quick switch's two hand-offs on one row as ghost buttons, and take the
  height they gave back off the popup rather than leaving it under the results.
- Shorten their copy to `New line` / `Manage lines`, in both languages. Only
  these two: the product's own vocabulary for a version line is unchanged.
- Say the scope in the History screen header's caption when it is not the current
  line, in the caption's own voice. It informs; it does not offer.
- `Another line…` becomes `Specific line…`.
- Give the chosen line a visible selected state inside the filter panel, with its
  own way out, without adding a permanent row outside the panel.
- Make `Actions` read as a control rather than a fact, without giving it a size
  of its own.
- Keep the local-line chips' affordance discreet: unchanged at rest, answering on
  hover and focus, with `aria-expanded` on the control that owns the menu.

# Out of scope

- Any redesign of Changes, History or Lines.
- A second version-line selector in any screen header.
- New native reads, or any change to the Git semantics task 118 settled.
- Renaming "version line" across the product.

# Acceptance criteria

- [x] `Working on` is still the global context, at a lighter weight than the
      line's name, and the status bar keeps its 34px.
- [x] The quick switch reads `New line` and `Manage lines`, on one row, each
      reaching the flow it already reached.
- [x] The popup is shorter by the row it gave back.
- [x] History's header names the scope only when it is not the current line, as
      part of the caption rather than as a badge or a control.
- [x] `Specific line…` replaces `Another line…` in both languages.
- [x] A chosen line is visibly chosen inside the filter, and can be cleared
      there; the state does not rest on colour alone.
- [x] `Actions` is told apart from the metadata around it and keeps its actions.
- [x] Interactive line chips answer on hover and focus and report their menu
      state; tags, remote refs and `HEAD` gain nothing.
- [x] Lines and Changes are unchanged; the three navigations still work.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/StatusBar.tsx`, `src/app/app-shell.css`
- `src/features/version-lines/VersionLineQuickSwitch.tsx`,
  `version-lines.css`, `translations.ts`
- `src/features/history/HistoryPanel.tsx`, `history.css`, `translations.ts`
- `src/architecture/styleComposition.test.ts`

# Dependencies

Task 118, which built what this refines.

# Decisions

**The footer actions became ghost buttons rather than shorter menu rows.** They
leave the control instead of choosing inside it, which is what a ghost button is
for here, and it hands them the shared control height and the shared quiet
treatment instead of a size of their own. The shape audit in
`styleComposition.test.ts` lost its `.version-lines-quick-switch__see-all` entry
for the same reason: the radius comes from the primitive now, and restating it
would be exactly the drift that audit exists to stop.

**The popup's height came down with them.** The box is fixed, so a shorter footer
without a shorter box is empty space under the results rather than a smaller
popup: 292 → 250px for the status variant, 380 → 338px for the roomier one.

**The scope belongs in the caption, not in a badge.** It is the same kind of fact
as the count beside it — what this screen is showing — and a badge would read as
a control the header does not have. Nothing was added when the scope is the
current line, because the status bar already says that and a caption that repeats
it teaches the reader to stop reading captions.

**The caption's separator is a plain `·`, not `HistoryMetaDot`.** That component
takes its spacing from the flex `gap` of the meta row it was built for; inside a
paragraph it sits flush against both neighbours. Found by the test asserting the
caption's text, which read `3 saved versions loaded·All lines`.

**`Actions` keeps the chips' 23px and takes an outline and a chevron instead.**
DESIGN.md's rule is that a control needing a size of its own is usually a control
with the wrong shape; a 32px button standing in a 23px metadata row is that
mistake. Outlined-plus-chevron against filled-and-plain is enough to separate the
row's one control from its facts, at the row's own scale.

**The chosen line is shown in the field rather than as a chip above it.** A chip
would add a row to a panel whose whole point is being compact, and the field is
where the answer already is. It gains an accent border, a heavier value and its
own clear control — the last being the signal that does not depend on colour.

# Implementation notes

`.version-lines-quick-switch__footer` is a flex row with `justify-content:
space-between`; the see-all keeps `margin-left: auto` when it is the only child,
which is the case wherever `onCreate` is absent. Both labels ellipsis rather than
wrap, so a narrow window compresses the row instead of breaking it into two.

The feature's `@media (pointer: coarse)` rule stopped restating 44px for these
two: `primitives.css` already raises every `.ghost-button` to
`--control-height-lg` there, and a second copy of an accommodation is how the two
drift apart.

`aria-expanded` is now on both menu triggers in the detail card — the local-line
chips and the actions control — which is what makes their open state visible to a
screen reader and lets the CSS mark it without a second class.

# Validation

```bash
pnpm run check
```

Passed: documentation, frontend architecture, TypeScript, 750 frontend tests, the
production build, `cargo fmt --check`, Clippy, and 378 Rust tests. No Rust source
changed in this task.

New frontend coverage: the status bar's "Working on" and its hierarchy; both
footer actions in one row, in reading order, each reaching its own flow; Escape
closing the quick switch and restoring focus to the strip; the header naming the
scope for `All lines` and a named line and staying silent on the current line;
the chosen line's selected state and its clear control, and the absence of that
control while no line is chosen; the actions control's `aria-expanded` and focus
restoration; and a local line in the detail acting while a tag and `HEAD` stay
facts.

Not verified in a running app: these screens read the repository through Tauri
IPC, which a browser preview cannot exercise. The geometry claims above are read
from the stylesheets and the tests, not measured on screen.
