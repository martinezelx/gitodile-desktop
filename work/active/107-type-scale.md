---
id: 107
title: Give typography a scale the way shape and size have one
status: active
priority: normal
type: refactor
areas:
  - frontend
  - design-system
created: 2026-09-03
completed:
parent:
queue: "26"
---

# Goal

Replace 24 hand-picked font sizes with a named scale in `tokens.css`, and write
that scale into `DESIGN.md` § Typography, which today states requirements but
not a single value.

# User outcome

Text at the same level of the hierarchy is the same size in every screen. Today
a secondary line is 12px in one panel and 12.5px in the next, and a control
label is 13px or 13.5px depending on which feature drew it — differences small
enough to never be reported as a bug and large enough to make the app look
slightly unresolved everywhere at once.

# Context

Found while closing task [106](../done/106-control-size-scale.md). That task fixed
control *size*; this is the same failure mode one level up, and it is now the
largest ungoverned axis in the system.

Counted across every CSS file in `src`: **24 distinct literal font sizes in 306
declarations**, and not one of them is a token.

| px | uses | | px | uses |
| --- | --- | --- | --- | --- |
| 12.5 | 60 | | 11 | 17 |
| 13 | 50 | | 14 | 13 |
| 12 | 46 | | 10.5 | 10 |
| 13.5 | 31 | | 10 | 8 |
| 11.5 | 20 | | 22 | 7 |

The remaining fourteen (7, 8.5, 9, 9.5, 14.5, 15, 15.5, 16, 17, 18, 20, 21, 23,
28) account for 51 more.

The shape of the problem is in the top of that table. **12, 12.5, 13 and 13.5
are four sizes inside one and a half points, used 187 times between them**, and
nothing distinguishes them: `.about-dialog__footer` is 12.5px secondary text,
`.palette-empty` is 13px secondary text, `.settings-dialog__header p` is 13.5px
secondary text. Three ways of saying the same thing, invented independently.

The cause is documented absence. `DESIGN.md` § Typography asks for "clear
distinction between headings, labels, body copy, and metadata" and "readable
line heights" — requirements with no values attached. Compare § Shape, which
names five radius tiers, gives a table of what each one *is*, states six
constraints, and is enforced by a guard. Where the design language gives a
number, the app is consistent; where it gives an adjective, every feature
answers it differently. Task 106 found exactly this for height and fixed it the
same way.

A related loose end from 106: there is still no `font-size` on `body` or
`:root`, so anything without an explicit size falls back to the browser's 16px.
Measured in the running app this is currently narrow — on the welcome screen only
`.compact-nav__item` lands there — but it is a trap rather than a defect: the
next element written without a size gets 16px silently, and 16px is a value
nobody in this codebase has ever chosen on purpose.

# Scope

- Add type-scale tokens to `styles/tokens.css`.
- Set a default `font-size` on `body` so nothing falls back to the browser's
  16px, and make it a step of the scale.
- Replace the literal `font-size` declarations across `app/`, `shared/ui/` and
  every feature with the token nearest their intent — nearest *role*, not
  nearest number; several of these will move by half a pixel and a few by more.
- Rewrite `DESIGN.md` § Typography around the scale, in the form § Shape uses:
  a table of what each step *is*, with examples.
- Add a guard to `architecture/styleComposition.test.ts` failing the build on a
  literal `font-size`, with any genuine exception allowlisted by name.

# Out of scope

- Line heights, weights and letter-spacing. They have the same problem and
  deserve the same treatment, but changing four typographic axes in one pass
  makes the visual review impossible to hold in your head. This task earns the
  right to that one by settling size first.
- The monospace stack and the diff/code type ramp. The diff panes are already a
  documented denser context (`DESIGN.md` § Size names the exception); whether
  they take their own scale or a compressed end of this one is a decision worth
  making with the diff work in front of you, not here.
- Font family, which is already settled and correct.

# Acceptance criteria

- [ ] A type scale exists in `tokens.css`, and every step is used.
- [ ] `body` declares a `font-size` from the scale.
- [ ] No CSS file in `src` contains a literal `font-size` outside the
      allowlisted exceptions.
- [ ] `DESIGN.md` § Typography names each step, says what it *is*, and gives
      examples — the shape § Shape and § Size already use.
- [ ] A guard in `styleComposition.test.ts` fails on a literal `font-size`, and
      was checked against a deliberate regression.
- [ ] Every screen and dialog reviewed against before/after, with the intended
      changes named and the unintended ones fixed.
- [ ] `pnpm run check:frontend` and `pnpm run check:docs` pass.

# Relevant files

- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/app/app-shell.css`
- `src/shared/ui/primitives.css`
- every file under `src/features/*/`
- `src/architecture/styleComposition.test.ts`
- [`DESIGN.md`](../../DESIGN.md)

# Dependencies

Task [106](../done/106-control-size-scale.md), which established that a visual axis
belongs in `tokens.css`, is documented in `DESIGN.md` with a role table, and is
held by a guard. This task follows that pattern; it does not depend on 106's
code.

# Decisions

**Open, and to be taken with the user before any code is written: the steps
themselves.** The clustering above suggests roughly seven, derived from where
the existing sizes actually pile up rather than from a ratio:

| Proposed | Absorbs | Role |
| --- | --- | --- |
| ~11px | 10, 10.5, 11, 11.5 | dense metadata, counts, timestamps |
| ~12.5px | 12, 12.5 | secondary text, hints, descriptions |
| ~13.5px | 13, 13.5 | default UI text and control labels |
| ~15px | 14, 14.5, 15, 15.5, 16 | emphasised body, dialog lead-in |
| ~17px | 17, 18 | card and section headings |
| ~22px | 20, 21, 22, 23 | screen headings |
| ~28px | 28 | the project name |

Two clusters need real judgement rather than arithmetic:

- **The 7–9.5px badge counts** (`.sidebar-project__badge-count` is 7px). They
  are not prose and folding them into an 11px step would break the shapes they
  sit in. They probably want naming as their own thing, the way the diff footer
  is named as its own thing in § Size.
- **The 10–11.5px code and diff surfaces.** Marked out of scope above, but the
  boundary between "dense metadata" and "diff chrome" has to be drawn somewhere
  and this task will hit it.

Already decided, carried from 106: a token states a **role**, never a size, and
the guard allowlists exceptions by name so a second one is a deliberate edit
rather than a quiet override.

# Implementation notes

Complete this section during implementation.

# Validation

Complete this section during implementation. Record the exact commands run and
their results.
