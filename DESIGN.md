# GitOdrile Design Direction

This document owns GitOdrile's visual and interaction direction. See
[`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) for the product thesis,
audience, positioning, and detailed competitive context.

## Design goal

GitOdrile should make a complex technical system feel calm, understandable, and safe. The interface must be modern and distinctive without sacrificing readability or looking like a decorative concept app.

The intended feeling is:

- friendly but professional;
- lightweight but capable;
- contemporary but durable;
- reassuring rather than intimidating.

## Visual character

Settled direction: **Friendly Card** — chosen after benchmarking against Sublime Merge/Fork (dense, flat, expert-only), Linear/Raycast (flat, minimal, colder), and GitKraken/Tower (moderate radius, opaque cards, soft shadow). It sits closest to GitKraken/Tower because that balance of "polished but not scary" best matches the brand brief, and it ages better than a glass-heavy look since shadows don't rely on translucency.

The visual language uses:

- fully rounded controls — a capsule for anything on one line, a circle for anything square — over 18px cards and panels and 10px rows, with circles for avatars and glyph tiles. Rounded enough to feel approachable, not so large it reads as a decorative concept app. The tiers are roles, not sizes; see Shape;
- **opaque panels**, not translucent glass — depth comes from `--shadow-sm/md/lg`, not `backdrop-filter` blur;
- layered surfaces distinguished by shadow and a subtle tone shift, not by transparency;
- thin, low-contrast borders around cards/panels as a secondary depth cue alongside shadow — but not as divider rules *inside* a list of rows (settings rows, nav groups); separate those with spacing alone, which reads cleaner than a hairline between every item;
- generous spacing around primary actions;
- compact spacing in file lists and diffs;
- a crocodile mascot used selectively.

Blur/translucency is not the default depth mechanism for GitOdrile chrome. Reserve it, if used at all, for genuinely transient overlays (a modal scrim) — never for a panel that sits on screen the whole session. Code, diffs, file lists, conflict editors, forms, and long-form content must sit on fully opaque surfaces.

## Layout concept

The main desktop window should broadly support:

1. **Top bar** — implemented as a custom titlebar rather than a traditional File/Edit/View menu bar, which reads as legacy Win32/desktop-app chrome:
   - far left: the app mark, corner-anchored at a small fixed inset. It is deliberately *not* centred over the rail's icon column: centring means reserving a rail-wide block for it, and the part of that block the mark does not fill pushes every titlebar control right by the same amount — a permanent cost to the toolbar for an alignment only visible when looked for. Desktop Git clients park a small mark in the corner and start the controls immediately.
   - left: the command-palette trigger (`Ctrl`/`Cmd`+`K`), the rail collapse control, and a compact overflow menu. The palette is a labeled rounded control, making it the visual entry point for app-wide actions instead of another anonymous icon.
   - the collapse control doubles as a jump menu: while the rail is collapsed, resting on it opens the rail's destinations as a short menu hanging off the button, so a destination can be reached without expanding and re-collapsing the rail around a single click. It carries the rail's three groups — destinations, projects (favourites only), and the app-level utilities — with the project group's two nested menus flattened, since a list this short can just say what those menus would have said. It is a menu, not a miniature rail — same furniture as every other flyout in the app.
   - contextual history: Back/Forward stay together with the command controls. They remain visibly disabled until there is history to traverse, then become available without moving the surrounding chrome.
   - center: the remaining native drag region, including double-click maximize/restore.
   - right: window controls (minimize/maximize/close), styled as small rounded buttons inset from the edge rather than full-height square hit targets, so they read as part of the same rounded-corner system as the rest of the UI instead of bolted-on OS chrome.

2. **Navigation rail** — a 64px column with no surface of its own: no fill, no
   border, no shadow. The window chrome (titlebar, rail, status bar) is one
   continuous plane, and only *content* sits in cards on top of it. Each
   destination is an icon in a 40px circle with its name underneath; the
   active state fills that circle, never the whole cell, so a two-line label
   like "Iniciar sesión" does not make its neighbour look shorter.

   The width is derived, not chosen. 64px is 8px of padding either side of the
   widest thing the column must hold, which is the longest unbreakable
   *destination* label across every shipped language — "Overview", at 46.3px.
   Chromium ships no Spanish hyphenation dictionary, so a narrower column can
   only break such a word mid-syllable, which is why Recovery is "Rescate" in
   Spanish and not "Recuperación" (66.7px). Settings was renamed to "Ajustes"
   for the same reason while the utilities were still captioned; that
   constraint is gone now that they are not, and the shorter name was kept on
   its own merits. **Re-measure before narrowing, and treat
   a new long destination name as a width decision, not just a copy one.**

   Destination names are one word for the same reason. Where the concept needs
   more, the short name is an *abbreviation* of the full term, never a second
   vocabulary: the Lines destination shows version lines, and the prose keeps
   saying "version line" — the same relationship the sync screen already has
   with "Current line" and "Remote line". A destination named from a different
   word than its own prose (say "Branches") would make the user learn that two
   names mean one thing.

   Navigation Settings may switch to icons only: every caption disappears —
   destinations and utilities alike, since a rail that labels one and not the
   other reads as an accident — and the column narrows to 56px, the icon circle
   plus its padding. The 40px pointer target and accessible name remain.
   - Overview, Changes, Lines, History, and Recovery keep their order.
     Navigation Settings controls which stay in the rail; deselected and
     height-overflowed destinations remain reachable in More, in registry
     order. Recovery stays disabled and marked "Coming soon" until its screen
     exists;
   - "More" is always the final destination tile. As the window loses height,
     the trailing destinations move into its menu in order instead of making
     the narrow rail scroll. The menu always ends after a separator with
     "Customize navigation bar", which opens the dedicated Settings section;
   - below the destinations: the active project as a single circle that opens
     a searchable switcher, plus a same-size "+" holding the three ways to add
     one (open, create, clone);
   - projects can be starred. Favourites sort to the top of the switcher and
     are the only ones the collapsed rail's jump menu lists, so that menu stays
     a shortcut rather than a second copy of the switcher. Until the first star
     is set it lists them all, because an empty group explains neither why it
     is empty nor how to fill it. The sort is display-only — the session order
     stays canonical, so starring a project never changes what Ctrl/Cmd+Tab
     cycles through. A favourite survives closing its project and is stored
     against the canonical worktree root, the same identity the session
     reducer uses, so it also survives restarts, path aliases and symlinks;
   - at the foot: Settings above the account button. These app-level utilities
     remain anchored and use the same footprint as the project controls;
   - only destinations are captioned. The controls below the rule — project,
     add, Settings, account — carry no visible label in either display mode:
     they are stable shapes, and the two that are less self-evident sit
     directly under what they act on (the avatar is the project's own
     initials; the "+" is under it). Captioning four controls that never
     change cost a line of text each and turned the column into a wall of
     words. Their accessible names stay on the buttons and concise localized
     tooltips give pointer and keyboard users the same names. The project
     tooltip includes its display name; the reserved account control states
     that sign-in is coming soon without implying an account is required;
   - unavailable destinations remain focusable but guarded from activation so
     their localized reason is reachable by pointer, keyboard and screen
     reader. In a text menu, show that reason directly rather than requiring a
     tooltip to explain a disabled row;
   - hover confirms interactivity with a stable neutral fill and foreground
     change. It never lifts or enlarges rail furniture, and never borrows the
     accent-tinted selected surface. Accent fill and green iconography remain
     reserved for the active destination or selected control;
   - a single faded rule separates the destinations from everything below.
     Spacing alone used to carry that split, and did while the utilities were
     unlabelled; once they gained captions the whole column became evenly
     stacked tiles and the interval stopped reading as a boundary. This is the
     documented exception to "separate rows with spacing alone": it divides two
     *groups*, not consecutive rows within one.
   - the rail can be collapsed entirely (`Ctrl`/`Cmd`+`B`, or the titlebar
     control), giving the window over to content. Collapsed means `display:
     none`, never a zero width or a transparent column: a rail still in the tab
     order is a trap for keyboard and screen-reader users. The state persists
     across sessions like every other chrome preference.

3. **Status bar** — a 34px strip along the bottom of the content column,
   spanning from the rail's edge to the window's, on every screen including
   Overview. It reports what is true of the project right now: branch, unsaved
   work, sync state and when that was last learned, and the app version.
   - it is chrome, not content: no fill, no radius, no shadow. Shadow signals
     stacking order, and this strip is the floor of the window rather than
     something resting on it; at 30px tall it could not carry the 14–18px card
     radius without reading as a pill;
   - it shares the workspace's horizontal inset through a variable rather than
     repeating the number, so its text sits in the same column as the content
     above it at every breakpoint;
   - no rules anywhere in it — not between its items, and not along its top
     edge. Spacing does all the separating, per the rule above: 5px binds an
     icon to its text, 8px binds the parts of one fact, 24px separates one fact
     from the next, and the workspace's own bottom padding leaves the band
     between the last card and this line of text;
   - the cut mid-scroll is softened by a fade to the window's colour drawn
     directly above the strip, not by a rule. It is drawn from the strip rather
     than masked onto the workspace because a mask on a scroll container
     recomposites every frame, and the screens that scroll most are the
     virtualized diff lists. Its height is the workspace's own bottom inset,
     from the same variable — that equality is what makes the fade free at the
     end of a scroll, where the band then contains only padding. The effect
     appears exactly when there is more to see and disappears when there is
     not, with no scroll listener deciding that;
   - the fade eases (`x²(3−2x)`) rather than ramping linearly. Equal steps of
     alpha are not equal steps of what the eye sees: near black it resolves far
     smaller luminance differences, so a linear ramp shows its own startpoint as
     an edge in dark mode while passing unnoticed in light. Easing moves alpha
     4% across the first eighth instead of 12.5%, so both ends dissolve into
     their surroundings. Any future scrim in this app wants the same curve;
   - fixed workbench screens whose panels own their scrolling, such as Changes
     and History, do not use the global fade. Their panel edge is already the
     scroll boundary; fading it makes the surface appear not to end. They keep
     only a compact 8px gap above the status bar;
   - the release metadata is grouped at the far right: the version is shown as
     `v0.1.0` with its compact lifecycle tag (`alpha`) beside it. Together they
     form one quiet button that opens the Changelog — the version the reader
     can already see is what a release note is *about*, so the tag leads to the
     notes and not to the product description. The changelog shares the About
     dialog's shell and lists each release with its channel, date, notes, and a
     marker for the build being run. Notes are bundled and open without a
     network request; a future application updater may report through this
     surface but must keep its remote state separate from the local notes. The
     titlebar stays reserved for global actions and window controls; no product
     name is repeated because the window is already the product;
   - the current version line is the strip's one navigation shortcut. Its
     quiet text treatment gains a hover/expanded fill and opens a compact,
     searchable selector above the strip. It shares search and project-scoped
     favourites with Overview's roomier selector: favourites sort first and
     may be isolated without changing repository or session order. The status
     version keeps fewer rows visible, while the Overview version uses its
     content surface to show more rows. Both show the latest saved-version
     subject under the line name so the same target has the same information
     hierarchy wherever it opens. Choosing a target still enters the normal
     previewed, state-checked switch flow. The full inventory and management
     actions stay in Lines. Detached and not-yet-saved states remain static
     facts;
   - the cloud refresh belongs only to the adjacent project-sync fact. It checks
     remote information without refreshing files, history, or line inventory.
     Local repository facts normally follow watcher invalidation, so screens do
     not repeat permanent checkers just to appear fresh. A screen exposes a
     manual action only where its ownership is useful: Changes when watching is
     off, unavailable, or a read failed; History inside the equivalent watcher
     notice or beside a failed snapshot; Lines
     beside a retained stale snapshot; and Overview beside the specific failed
     local, remote, or history fact. Overview never coordinates an omnibus
     refresh across unrelated local and network reads;
   - watcher notices precede the screen title, use the same visible “Update
     now” action in Changes, History, and Lines, and link directly to General settings
     to restore automatic updates. Their accessible names may retain the exact
     data scope while their visible recovery wording stays consistent. Both
     actions use the same quiet control treatment; a manual update keeps the
     notice mounted, changes its label to “Updating…”, and spins its refresh
     icon until the owning read settles;
   - automatic-update copy stays literal and compact: Settings explains that
     file and saved-version changes update open projects, while the warning
     says only that updates are off/unavailable and the current screen may be
     out of date. The adjacent actions carry the recovery instructions;
   - remote checks remain independent from screen visibility. General settings
     offers manual-only, 15-minute, 30-minute, and hourly cadences; one timer
     follows the active project session, skips states without a usable upstream,
     and shares the same deduplicated check path as the status-bar action;
   - interactive chrome raised the text to 13px, inline icons to 14px, and the
     remote-check target to 28px. Coarse pointers receive the standard 44px
     target and a correspondingly taller strip;
   - it must never state something untrue about a repository. It is the one
     surface in the app whose whole purpose is to be believed at a glance.

4. **Primary workspace**
   - task-focused content;
   - clear empty states;
   - contextual primary action;
   - secondary technical details on demand.

5. **Optional inspector**
   - metadata;
   - exact Git details;
   - file or commit information.

The app should work well between approximately 1024px and large desktop displays. Do not assume a maximized window.

## Design tokens

```css
:root {
  /* Radius states a role, not a size — see Shape below. */
  --radius-item: 10px;
  --radius-control: 14px;
  --radius-surface: 18px;
  --radius-pill: 999px;
  --radius-round: 50%;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --duration-theme-reveal: 420ms;
}
```

Colors should be defined semantically rather than by component:

- `--surface-app`
- `--surface-panel`
- `--surface-raised`
- `--surface-code`
- `--text-primary`
- `--text-secondary`
- `--border-subtle`
- `--accent-brand` / `--accent-brand-contrast` (the fixed lime brand mark and primary CTA)
- `--accent-primary`
- `--accent-primary-contrast` (text/icon color placed on top of `--accent-primary`)
- `--accent-primary-fill` (fixed lime fill for selected controls)
- `--status-success`
- `--status-warning`
- `--status-danger`
- `--status-danger-contrast` (icon/text placed on a danger fill)
- `--accent-heart` (the About footer heart — its own token so a red heart is
  never mistaken for a danger state)
- `--diff-added`
- `--diff-removed`
- `--overlay` (modal/backdrop scrim)
- `--surface-hover` / `--surface-active` (neutral interactive-state tints, used for any hover/pressed/selected state instead of one-off `rgba(...)` values)
- `--surface-control` / `--border-control` (the fill and edge of a control that sits *on* a raised card — see Shape below; never use `--surface-panel` for this, it is the same white as `--surface-raised` in light mode and leaves the control with no step of its own)
- `--focus-ring` (the visible keyboard focus color, distinct enough against every focusable surface)
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` (elevation; theme-aware, see below)

Do not hard-code product colors throughout components.

### Elevation

Use shadows to signal stacking order, not to decorate: `--shadow-sm` for resting cards and controls, `--shadow-md` for content the user is meant to focus on (hero card, a lifted hover state), `--shadow-lg` for anything floating above the whole UI (dialogs, popovers). In dark mode shadows read as depth against the near-black background; in light mode they carry more of the separation work since borders alone are subtler there — both are defined per theme so neither look goes flat.

### Shape

**Radius states a role, never a size.** There is no house radius applied to
everything, and there is no "small/medium/large" scale to pick from — sizing
the radius by eye is exactly what left buttons scattered across three different
values before this was written down. Choose the tier by what the thing *is*:

| Token | What it is | Examples |
| --- | --- | --- |
| `--radius-round` (50%) | An atomic thing with no reading direction | Project avatar, **any single glyph on a fill** (section, status and dialog-header icons), rail destination, refresh, create, overflow trigger, checkbox, timeline node |
| `--radius-pill` (999px) | **Any single-line control**, a capsule of short text, or a pure geometric form | Labelled button, single-line input, search box, selector or trigger; badge, count, status chip, progress bar, scrollbar thumb, toggle track |
| `--radius-item` (10px) | A row or option that lives inside a container | Menu row, list option, file row, segmented-control option, inline code, keycap, square icon button of 24–36px that is not in an action row |
| `--radius-control` (14px) | A control that *cannot* be a capsule | Multi-line field (textarea), a frame wrapping its own options (segmented control), a preview box, square icon button of 40px and up that is not in an action row |
| `--radius-surface` (18px) | A container carrying its own background | Card, dialog, popover, menu, notice, banner, panel |

A circle has no "length", so it has no radius to scale — that is why it is a
role and not a number. Mixing circles with the rectangular tiers in one row is
correct and intended: it is what lets a labelled control read as primary next
to its icon-only satellites without spending an accent color on the difference,
since a circle of the same box reads optically smaller and lighter. Three radii
in one row is where it stops being a system and starts being drift; keep it to
two.

A single-line control is **fully rounded**: a capsule when it carries a label,
a circle when its box is square. The two are the same shape at different aspect
ratios, so a button, a search field and an icon button read as one family, and
hierarchy comes from fill and colour rather than from corner size. Two things
follow. A capsule needs inline padding near its radius — about 0.4 of its own
height — or the label sits inside the curve. And capsules nest concentrically
with each other for free: radius is half the height, so `outer = inner +
padding` holds at every size without anyone computing it. The Changes action
cluster is the worked example — a capsule wrapping two circles and a capsule.

What stays rectangular is what *cannot* be a capsule: a textarea, because it is
multi-line and a capsule would deform it; a frame that wraps its own options,
like the segmented control, whose options are rows and would have to become
capsules with it; and a preview box, which holds a layout rather than a line of
text.

The three rectangular tiers are a **concentric chain**, so a container is
already the right radius for what it wraps:

```
item 10    + 4 padding = control 14    a segmented control around its options
item 10    + 8 padding = surface 18    a menu around its rows
control 14 + 4 padding = surface 18    a toolbar around its buttons
```

Six constraints keep this honest:

- **Concentricity** (`outer = inner + padding`) is measured against whichever
  child sits at the container's *corners*, not against its tallest or its
  first. The Changes action cluster hugs 38px circles (r=19) with 8px of
  padding, so it is `--radius-pill`, which resolves to 27 at that height and
  stays correct when a coarse pointer grows the controls to 44px. Get it wrong
  and the corners look pinched. It only binds when a child is actually near a
  corner: the Overview summary card stays `--radius-surface` because its
  controls sit 24px inside it.
- **A circle needs a square box.** Only apply `--radius-round` where width and
  height are both pinned. If a narrow layout lets the control stretch, the
  circle becomes an ellipse — give the free width to the labelled action and
  leave the icon buttons at `flex: 0 0 auto`.
- **A container stops being a card at half its own height.** `--radius-surface`
  on a 54px cluster still reads as a rectangle; on a 36px one it is a pill, and
  the contrast against the circles inside it is gone. Reach for
  `--radius-pill` deliberately in that case rather than arriving there by
  accident.
- **A glyph tile is a circle at every size.** A square holding one icon on a
  fill — a section heading, a status marker, a dialog header, a row's leading
  icon — is the same atomic thing as an avatar, so it takes `--radius-round`
  whether it is 24px or 52px. It is not sized into a tier, because it has no
  length to scale. The two exclusions are worth knowing: a tile with a
  transparent fill is not a tile (it is a bare glyph, and rounding nothing is
  nothing), and a preview holding a miniature layout rather than one glyph is a
  container, so it stays `--radius-control`.
- **A square icon button is a circle when it lives in an action row.** Ask
  where it sits, not what it does. An *action row* is a strip whose whole
  content is standalone actions — the rail, the titlebar cluster, a panel
  header's action group; there, an icon-only button takes `--radius-round` and
  joins the family. Anywhere else the button is an **affordance attached to a
  host** — a notice's dismiss, a path's copy button, a dialog header's close, a
  settings row's reorder arrows — and it stays rectangular, because rounding it
  would make it compete with the thing it belongs to. The one exclusion is
  `.window-control`: minimise/maximise/close are the operating system's chrome
  and follow its conventions, not ours, even though they sit in an action row.
- **A rectangular icon button takes the tier below its side.** This is the one
  place size still enters the decision, because one value cannot serve a 24px
  box and a 52px one. Up to 22px use `--radius-round`: at that size any radius
  worth seeing has already closed the shape into a circle, so name it one. From
  24 to 36px use `--radius-item`, from 40px `--radius-control`. Both bands land
  the shape between 0.27 and 0.42 of radius over side, which is what reads as
  clearly rounded and clearly not a circle — `--radius-control` on a 28px
  button is exactly 0.5, an accidental circle. A guard in
  `styleComposition.test.ts` fails the build on anything that lands in the
  0.43–0.5 gap between the two readings.

One caveat that applies to every circle above: `border-radius` clips pointer
hit-testing, so a circle loses about a fifth of its clickable area and its
corners go dead. That is a real cost only where the shape is a *target* — keep
the 44px coarse-pointer override on circular controls, and prefer a rectangle
for a small interactive one. It costs nothing on an avatar or a glyph tile,
which is why those are circles at any size.

### Icons

Sidebar navigation and inline controls use [Lucide](https://lucide.dev) icons (`lucide-react`, ISC) at 16–18px, imported by name so unused icons are tree-shaken out of the bundle. Chosen over hand-drawing our own because it ships real Git-specific glyphs (`GitCompare`, `GitCommitHorizontal`) instead of the generic pencil/clock metaphors the app used before — see the icon-library comparison done when this was decided. An active nav item tints its icon with `--accent-primary`; the label stays `--text-primary`. Don't mix in a second icon library or hand-drawn icons alongside it — pick the closest Lucide glyph even when it's not a perfect semantic match.

Brand identity (mark + name) appears in exactly one visible place at a time, never two. **The titlebar is the canonical one**, and the rail carries no brand block: a 40px lockup at the top of the rail spent that column's most valuable real estate on something that never changes, and forced the titlebar to suppress its own mark to avoid reading as a double logo. One mark, in the window furniture, next to the controls it belongs with. The wordmark joins it only below the 800px breakpoint, where the rail is gone and nothing else on screen names the app.

The mark is the crocodile silhouette itself, not a silhouette knocked out of a green tile, and it is painted in `--accent-primary` — *not* `--accent-brand`. This follows the standing rule below rather than breaking it: the brand lime is a single fixed value in both themes, which works behind a tile it also supplies the contrast for, but a bare mark on the light app surface measures 1.95:1 with it. `--accent-primary` is the per-theme green and measures 5.09:1 on light and 11.46:1 on dark. The About dialog uses the same treatment at hero scale — one identity, one rendering.

The titlebar mark is also the About affordance, as it is in every desktop application: clicking the identity is how you ask what the thing is. It is deliberately the *quiet* route — no tooltip and no hover plate, because a fill would turn the identity into the first button of the toolbar and advertise a shortcut nobody needs advertised. The signposted routes are the toolbar menu and the command palette; this one rewards knowing the convention. What it does keep: an accessible name, which is invisible to a sighted user and is the only thing naming the button to a screen reader; a 30px target around the 24px glyph, since nothing paints that box and an unadvertised control still has to be easy to hit once found; and a response on the silhouette itself — the mark deepens toward `--text-primary` on hover (6.85:1 on light, 12.97:1 on dark, from a resting 5.09:1 and 11.46:1) and presses with the same `scale(0.94)` the rail icons use. `data-tauri-drag-region` stays on the wrapper around it, so the chrome still drags the window while the button keeps its click.

### Honest affordances

A control that does nothing yet must not look fully interactive. Navigation entries for screens that don't exist yet (e.g. Changes, History, Recovery before their flows are built) are rendered `disabled` with reduced opacity and a visible “Coming soon” status, rather than looking clickable and silently failing. An upcoming primary-card action may remain visible when it makes the planned next step clear, but it must be disabled and honestly marked as unavailable. Replace the disabled state with a real view as soon as the screen exists — don't leave it disabled out of habit.

### Theming: light and dark

The fixed brand lime (`--accent-brand: #8bc53f`) belongs to the mascot and primary CTA, always paired with its dark contrast color; it is never used as standalone text on a light surface. Semantic green (`--accent-primary`) is deliberately darker in light mode and lighter in dark mode so it can carry small labels, focus, status, and future diff markers accessibly. Each theme gets its own values while retaining the same warm stone/lime family.

| Token | Dark value | Light value |
|---|---|---|
| `--surface-app` | `#0a0a0a` | `#faf8f5` |
| `--surface-panel` | `#1a1a1a` | `#ffffff` |
| `--surface-raised` | `#242424` | `#ffffff` |
| `--surface-code` | `#1a1a1a` | `#f5f5f4` |
| `--text-primary` | `#fafafa` | `#1c1917` |
| `--text-secondary` | `#a1a1aa` | `#6f6a64` |
| `--border-subtle` | `#27272a` | `#e7e5e4` |
| `--accent-brand` | `#8bc53f` | `#8bc53f` |
| `--accent-brand-contrast` | `#14170f` | `#14170f` |
| `--accent-primary` | `#9bd65a` | `#4f751e` |
| `--accent-primary-contrast` | `#0a0a0a` | `#14170f` |
| `--accent-primary-fill` | `#9bd65a` | `#9bd65a` |
| `--status-success` | `#9bd65a` | `#4f751e` |
| `--status-warning` | `#e8b339` | `#8a5b00` |
| `--status-danger` | `#ff6b5b` | `#b3261e` |
| `--status-danger-contrast` | `#14170f` | `#fff7f5` |
| `--accent-heart` | `#ff7a6b` | `#cc2936` |
| `--diff-added` | `#9bd65a` | `#496f19` |
| `--diff-removed` | `#ff6b5b` | `#b3261e` |
| `--overlay` | `rgba(0, 0, 0, 0.68)` | `rgba(28, 25, 23, 0.4)` |
| `--surface-hover` | `rgba(255, 255, 255, 0.06)` | `rgba(28, 25, 23, 0.05)` |
| `--surface-active` | `rgba(155, 214, 90, 0.14)` | `rgba(107, 155, 46, 0.12)` |
| `--focus-ring` | `#9bd65a` | `#4f751e` |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.22)` | `0 2px 8px rgba(28,25,23,0.06)` |
| `--shadow-md` | `0 8px 20px rgba(0,0,0,0.3)` | `0 8px 20px rgba(28,25,23,0.08)` |
| `--shadow-lg` | `0 24px 80px rgba(0,0,0,0.45)` | `0 24px 60px rgba(28,25,23,0.14)` |

`--surface-active` is accent-tinted rather than neutral gray in both themes — this is what gives the active nav item and selected segmented-control option their "friendly card" warmth instead of a flat gray highlight.

Every text/surface pairing above must hold at least a 4.5:1 contrast ratio (WCAG AA for body text); accent-on-surface pairings used only for large text, icons, or borders may use the AA large-text threshold (3:1) instead.

Theme resolution order (highest priority first):

1. An explicit user choice (light/dark), persisted locally and applied immediately.
2. The OS-level preference, read via `prefers-color-scheme` and followed live if the user has not overridden it.

The user must always be able to return to "match system" — the toggle is a three-state cycle (`system` → `light` → `dark` → `system`), not a binary switch, so an explicit choice never silently strands the user on a theme that has drifted from their OS setting.

Do not introduce a color anywhere in the product (status badges, diff highlighting, charts, mascot variants) without first checking whether it is expressible through an existing token; new one-off colors fragment the light/dark story.

## Brand and mascot

Working brand: **GitOdrile**.

Mascot: a stylized crocodile that feels clever, calm, and trustworthy.

Potential visual traits:

- rounded geometric silhouette;
- simple eye and one or two restrained teeth;
- confident, neutral expression;
- recognizable at 16–32px;
- adaptable to monochrome tray/taskbar contexts;
- not overly detailed or child-oriented.

The mascot may appear in:

- application icon;
- onboarding;
- empty states;
- success and recovery moments;
- documentation and marketing.

Do not place the mascot in every panel or use it to trivialize serious errors.

**Application mark:** the compact GitOdrile mark is a rounded, geometric
crocodile head with two attentive eyes, two small snout details, and a calm
smile. Its facial details are transparent cutouts rather than white decoration,
so the single-color SVG in `src/assets/gitodrile-mark.svg` can inherit any
foreground/background pairing. The native app icon places the dark mark on the
fixed brand-lime rounded tile (`#8bc53f`); its eye, snout, and smile cutouts
reveal that lime beneath. Keep this compact mark consistent in the sidebar,
compact titlebar, About dialog, and packaged application icons.

Inside the application, the crocodile is dark (`#14170f`) in dark mode and
warm pearl (`#faf8f5`) in light mode. This theme-aware treatment belongs only
to the decorative brand lockup; primary actions continue to use
`--accent-brand-contrast` for accessible text and icon contrast.

## Typography

Use the system UI font stack for application chrome and prose. Dense source
content may use the bundled Atkinson Hyperlegible Mono Regular with the system
monospace stack as fallback; keep it scoped to code and technical identifiers.

Requirements:

- clear distinction between headings, labels, body copy, and metadata;
- monospaced text for paths, refs, hashes, commands, and diffs;
- restrained semantic syntax tokens may clarify code, but diff backgrounds and
  signs remain the primary added/removed signal;
- readable line heights;
- no tiny low-contrast secondary text;
- avoid all-caps labels except very short status tags.

## Motion

Motion should communicate relationships and state changes, not decorate.

Good uses:

- panel transitions;
- file selection;
- expanding technical details;
- successful save/publish feedback;
- progress between safe-operation steps.

Rules:

- keep most transitions between 120–220ms;
- one deliberate exception (`--duration-theme-reveal`): the titlebar theme
  toggle sweeps a circular reveal across the whole window, and at 220ms a
  travel that long reads as a flash rather than a movement. Settings and the
  command palette have no single origin to sweep from, so they cross-fade the
  window at `--duration-normal` instead; either way the whole surface changes
  together, rather than the background fading while the panels on top of it
  snap;
- avoid large spring animations in work surfaces;
- respect `prefers-reduced-motion`;
- never delay an operation solely to show an animation.

## Transparency and native effects

CSS translucency (`backdrop-filter` blur) is not used for standing chrome — the sidebar, top bar, and cards are opaque; see "Visual character" above. It may still appear briefly behind a modal/command-palette scrim, since that's a transient overlay rather than a panel the user stares at all session.

Native window effects such as Windows Mica/Acrylic and macOS vibrancy are optional enhancements and, if adopted later, are a visual bonus layered under still-opaque content — not a substitute for the shadow-based depth system. The app must look complete without them because behavior varies by OS, compositor, and webview. Linux should receive a deliberate solid-surface fallback.

## Accessibility

Minimum expectations:

- full keyboard navigation for primary workflows;
- visible focus states;
- WCAG AA text contrast where practical;
- do not communicate file state only through color;
- scalable text and layouts;
- screen-reader labels for icon-only controls;
- reduced-motion support;
- minimum comfortable pointer target sizes.

Keyboard shortcuts must use platform conventions:

- `Ctrl` on Windows/Linux;
- `Cmd` on macOS.

### Pointer cursors

Follow desktop rather than browser cursor conventions. Standard controls —
buttons, menus, selectable rows, checkboxes, navigation, and dropdowns — keep
the system arrow and communicate interactivity through shape, hover, pressed,
selected, and focus states. Disabled controls also keep the arrow; reduced
opacity and the disabled interaction state carry that meaning.

Reserve the pointing hand for real links and text actions deliberately styled
as links, where the cursor helps compensate for their lighter affordance. Use
special-purpose cursors only when they describe the operation itself, such as
text selection, resizing, dragging, progress, or a forbidden drop target.

## Content design

The interface should explain Git in plain language while preserving technical truth.

Good:

> You have 3 saved versions that have not been published yet.

Less suitable as the default:

> Your branch is 3 commits ahead of origin/main.

Advanced details may display both.

Action labels should describe outcomes:

- Save version
- Publish changes
- Get project changes
- Set changes aside
- Restore this version
- Create separate workspace

Avoid vague labels such as “Continue” when a more precise action fits.

## Core screens for the first design pass

1. Welcome / open project.
2. Repository overview.
3. Changed files and diff viewer.
4. Save-version flow.
5. Sync/publish flow.
6. History timeline.
7. Recovery center.
8. Conflict resolution.
9. Settings and Git diagnostics.

Each screen must define loading, empty, success, warning, and error states.

Reuse one visual pattern for all of these across screens rather than each screen inventing its own: a centered block with a small icon in a bordered/shadowed circle (`--radius-round`, like every glyph tile), one short headline, one line of supporting copy, and 1–2 actions — see `.empty-state` in `src/shared/ui/primitives.css`, first built for the "no project open" Overview state. A loading state is the same layout with a spinner/skeleton instead of the icon; an error state swaps in `--status-danger`. Do not build a bespoke illustration or a different card shape per screen — that's how a "no repository" panel and a "no results" panel end up looking like they belong to two different apps.

**The welcome screen is the one documented departure, and it departs in one
direction only.** Screen 1 is a front door, not a "nothing here" report: it has
three peer entry points — create, open, clone — where the pattern allows one or
two, and as capsules their labels wrapped to three lines *inside* the pill,
because a capsule is a single-line control by definition (§ Shape). It keeps
the block, the headline and the one supporting line, and replaces only the
action row with a launcher: one card per action (`--radius-surface`), each a
circular glyph tile with its label and a one-line hint underneath, reusing the
add-project menu's own icons so both routes to the same three flows look
related. The pattern's own glyph tile goes away there rather than becoming a
fourth circle above three, and **the three read as peers**: same tile, same
weight, no accent on any of them. The old row had one green pill and two grey
buttons, so the shape carried a recommendation; as cards it would be a claim
the screen cannot support, since which action is right depends entirely on what
the user already has on disk. The hint under each label answers that, and it
answers it better than a colour that only says "this one".
Progress lives on the card that is working — opening a project reports in the
Open card — not in a spinner at the top of the screen. This screen also owns
the app's only `h1` while no project is open; the shell does not additionally
title it "Overview". Read the departure as "a launcher earns cards", not as
"empty states may invent shapes".

Under the launcher the same screen lists **recent projects** — left-aligned
rows inside the centred block, because names and paths are read down an edge
rather than from the middle out. Each row carries the project's own avatar,
the same colour and initials the rail and the switcher give it, since the
point of a recents list is recognizing a project without reading it; the name
is the row's accessible name and the path its description, so two projects
sharing a folder name are still told apart. Its "remove from recents" control
follows the switcher's Close: faded until the row is pointed at, because it is
destructive and rarely wanted, and always solid where there is no pointer.

The row's star is the **same favourite the rail and the switcher show**, from
the same store and with the same strings — one mark on one project, not a
list-local flag, so starring it here stars it everywhere. Favourites sort to
the top of the list before it is sliced, which is what keeps a project someone
cares about reachable on the front door after it has aged out of the newest
few. Like the switcher's star it is rendered at rest rather than on hover: a
marked favourite has to be readable without pointing at it, and a hover-only
control cannot be reached by keyboard at all.

**Dropping a folder on the window** opens it. While a drag is over the window
— and only then — a window-sized overlay names what a drop will do. It is
feedback about a gesture, not chrome: it never takes the pointer (an overlay
that swallowed the pointer would cancel the drop it invites), it stays out of
the accessibility tree because a drag has no keyboard equivalent to narrate,
and it does not appear under a blocking dialog, which is exactly when a drop is
ignored. Its dashed edge is the only dashed border in the app and is meant to
stay that way: dashes are the universal "drop here" mark, and a solid edge at
that size would read as a dialog.

**A dialog that carries a message is not the About dialog.** About is the
product-identity surface — the mark at hero scale, a 28px heading, 32px of
padding — and for a while the open-failure alert and the close-project
confirmation borrowed its shell, which is why a two-line sentence arrived under
a heading sized for a logo. (The changelog and the shortcut sheet still extend
About's shell on purpose: they are documents to read, not messages to answer.)
Short message dialogs use the same shell as every other dialog in the app: a
22px heading, 28px of padding, one gap between parts, and `.dialog-actions`
last. Two rules go with them. An error carries a
circular `--status-danger` glyph above its heading, because a failure should be
recognizable before the sentence is read. And **the constructive choice is the
primary button** — "Turn this folder into a project", not "Close": spending the
brand green on dismissing a problem tells the user the way out is the way back.
Dismiss reads first, constructive last, the order every other dialog uses.
