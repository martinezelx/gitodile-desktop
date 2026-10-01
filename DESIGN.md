# GitOdile Design Direction

This document owns GitOdile's visual and interaction direction. See
[`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) for the product thesis,
audience, positioning, and detailed competitive context.

## Design goal

GitOdile should make a complex technical system feel calm, understandable, and safe. The interface must be modern and distinctive without sacrificing readability or looking like a decorative concept app.

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

Blur/translucency is not the default depth mechanism for GitOdile chrome. Reserve it, if used at all, for genuinely transient overlays (a modal scrim) — never for a panel that sits on screen the whole session. Code, diffs, file lists, conflict editors, forms, and long-form content must sit on fully opaque surfaces.

## Layout concept

The main desktop window should broadly support:

1. **Top bar** — implemented as a custom titlebar rather than a traditional File/Edit/View menu bar, which reads as legacy Win32/desktop-app chrome:
   - the overflow menu starts with Projects (Proyectos), a quiet way to the project-opening screen while projects remain open. The command palette offers the same destination; the titlebar and rail add no permanent Projects button.
   - no brand: the titlebar is controls only and starts with the overflow menu, centred over the rail's icon column so the titlebar and the rail share one vertical axis (with no rail, it sits at the plain edge inset). It once carried the app mark in the corner (later the full mascot); a colour illustration in a row of line icons drew the eye to a spot that does nothing, and the operating system already shows the app icon. The mascot lives in the brand moments instead (see "Brand and mascot").
   - left: the command-palette trigger (`Ctrl`/`Cmd`+`K`), the rail collapse control, and a compact overflow menu. The palette is a labeled rounded control, making it the visual entry point for app-wide actions instead of another anonymous icon.
   - the collapse control doubles as a jump menu: while the rail is collapsed, resting on it opens the rail's destinations as a short menu hanging off the button, so a destination can be reached without expanding and re-collapsing the rail around a single click. It carries the rail's three groups — destinations, projects (favourites only), and the app-level utilities — with the project group's two nested menus flattened, since a list this short can just say what those menus would have said. It is a menu, not a miniature rail — same furniture as every other flyout in the app.
   - contextual history: Back/Forward stay together with the command controls. They remain visibly disabled until there is history to traverse, then become available without moving the surrounding chrome.
   - center: the remaining native drag region, including double-click maximize/restore.
   - right: window controls (minimize/maximize/close), styled as small rounded buttons inset from the edge rather than full-height square hit targets, so they read as part of the same rounded-corner system as the rest of the UI instead of bolted-on OS chrome.
   - between the drag region and the window controls: the notification bell — the
     inbox for "what happened while you were elsewhere", which desktop apps keep
     in the window furniture rather than in a workspace panel. It carries no
     number: a count painted over a 16px glyph had no room and, coloured
     `--status-danger`, said "something is wrong" when it meant "there is
     something new". An 8px accent dot marks unread and breathes three times on
     an arrival, then settles; the exact count is the button's accessible name
     and the panel's rows. The panel has no visible title — the bell already
     names it — and it is not a menu: each entry is its own card, an unread one
     carries the dot and a heavier title, and a per-row trash sits in the
     bottom-right corner, uncovered only while its row is pointed at or
     focused, so the destructive control is deliberate and the dot never
     competes for the corner. A footer of two icons — settings on the left,
     clear-all on the right — keeps the destructive control away from the
     benign one, and clear-all is disabled while the list is empty. When
     notifications are off, the panel says so and offers the same switch
     Settings uses, bound to the same preference, so they can be turned back on
     without leaving the window. The switch fades out once notifications are
     back on, but its place is held, so the empty block never resizes under the
     pointer. The long explanation of what
     gets reported stays in Settings, where it is the point rather than a
     paragraph under an empty inbox. There it is one group on one icon column:
     the switch leads with the bell, and the events hang under its label as a
     bordered list ("You'll be told when…"), each with the icon its
     notification wears and no control of its own, so they read as what the
     switch covers rather than as settings missing a switch. A kind recorded as
     already read carries a "Silent" tag instead of a sentence explaining it.
     With notifications off the bell is struck through and the list stays, in
     the secondary ink and down to its names, so what turning it on gives is
     still in view.

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
   - Overview, Work, Lines, and Recovery keep their order. Work is what has
     changed and what has been saved — one loop, one screen, with Changes and
     History as its two tabs (they were neighbouring screens until task 126,
     and by then shared everything but the rail entry: one strip per panel,
     one list column, one diff toolbar, one find). The destination is "Work"
     rather than "Workspace" for two reasons: "Workspace" measures ~54px in
     the rail's type against the 46px the column was derived from, and
     "workspace" already means a version line in the vocabulary table. Lines
     follows: switching a version line is a deliberate move between
     pieces of work rather than a step in that loop. Navigation Settings
     controls which stay in the rail; deselected and height-overflowed
     destinations remain reachable in More, in registry order. Recovery stays
     disabled and marked "Coming soon" until its screen exists;
   - "More" is always the final destination tile. As the window loses height,
     the trailing destinations move into its menu in order instead of making
     the narrow rail scroll. The menu always ends after a separator with
     "Customize navigation bar", which opens the dedicated Settings section.
     There the destinations are the same bordered list as Notifications: each
     row reads icon, name, then how to move it (arrows that surface on hover
     or focus, and the grip), then its switch. A destination switched off keeps
     its row in the secondary ink with an "In More" tag, so the list never
     changes height and its place in the order stays visible;
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
     directly under what they act on (the avatar identifies the active
     project; the "+" is under it). Captioning four controls that never
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
   - a faint tray separates the destinations from everything below: one pill
     of `--surface-hover` behind the project chip and the utilities — rounded
     at `--radius-surface` instead while the square project chip leads it, so
     the chip's corners sit as far in as its sides — at about a
     third of its strength at rest and full strength while the pointer rests
     on it, focus is inside it or one of its menus is open. It is the only
     fill the rail carries that is not a control's own, and it marks a
     *group*, not a surface: no border, no shadow, never raised. A full-width
     faded rule did this first, then an 18×3px capsule; both were strokes in a
     column of rounded fills, and the capsule, glyph-sized and right above
     "+", read as a minus button rather than a boundary. Outlined or
     edge-lit versions of the tray were tried and dropped: a lit edge gives
     the foot a 3D lip the flat chrome has nowhere else. The free height above
     the foot carries the split in a tall window; when a short one folds
     destinations into More and closes that gap, the tray's own shape keeps
     it. This is the documented exception to "separate rows with spacing
     alone": it divides two *groups*, not consecutive rows within one.
   - the rail can be collapsed entirely (`Ctrl`/`Cmd`+`B`, or the titlebar
     control), giving the window over to content. Collapsed means `display:
     none`, never a zero width or a transparent column: a rail still in the tab
     order is a trap for keyboard and screen-reader users. The state persists
     across sessions like every other chrome preference.

3. **Status bar** — a 34px strip along the bottom of the content column,
   spanning from the rail's edge to the window's, on every screen including
   Overview. It reports what is true of the project right now: which project,
   its branch, unsaved work, sync state, and the app version. It says each in
   the fewest marks that stay true at a glance. The project's name and the
   line's name are the sentence, with no words in front of them; the name is
   what keeps the strip saying something once the reader has left Overview,
   and both truncate rather than wrap. Unsaved work is the project switcher's
   own mark — the changes icon with the count riding its corner, and, after it,
   the added and removed line totals (`+12 −3`) in the diff's own two inks at
   the label size, quiet enough to read as a second fact rather than a banner.
   The sentence ("28 unsaved changes · 12 lines added, 3 lines removed") is in
   the tooltip and for the screen reader; a total is drawn only when the backend
   could count the whole tree and at least one line moved, because unknown is
   not zero and `+0 −0` is noise. Neither the count nor the totals is a run of
   selectable text: the mark is chrome, so it keeps the default cursor.
   Overview's band is where the number is read in full. The remote fact is one
   word in one tone — the cloud green when all is well, amber when the reader
   should doubt or act — and *how* it is known (a saved snapshot, when it was
   checked) is the tooltip, not a second item; when a result is stale or a
   check failed, the doubt takes the word and the last known state moves to
   the tooltip, so the strip never reads as current when it is not. When the
   relation is ahead and known-current, that same cloud is also the shortcut to
   publishing: it becomes a button wearing the version-line control's 28px
   pill, and its tooltip names the action ("Publish 3 versions · Checked 5 min
   ago"). A stale, failed or still-loading answer keeps it a plain fact — it is
   not a state to act from. The
   branch is also the app's one global version-line control: its dropdown
   switches, creates — in place, see Lines — and hands off to the Lines
   screen. No screen adds a
   second selector to its own header: two controls answering one question in
   one window is how a reader stops trusting either. A small project-settings
   gear sits between the project name and the version-line control on every
   screen with an open project. It names that project for keyboard and screen-
   reader users and is absent from the no-project state.
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
   - the release metadata is grouped at the far right, a step further from
     the project facts than they are from each other and a size smaller: it
     is the one thing on the strip that is not about the project. The
     version is shown in full as `v0.2.0-preview.1`; the string already names
     the channel, so a preview build adds only a flask glyph (`.channel-glyph`)
     in warning tint to the right of it, never the word a second time. Stable
     builds draw nothing. The glyph is decorative — the version text and the
     control's accessible name carry the channel. The two channel names are `stable` and `preview`, kept the same in both locales.
     Together they form one quiet button that opens the Changelog — the version the reader
     can already see is what a release note is *about*, so the tag leads to the
     notes and not to the product description. The changelog shares the About
     dialog's shell and lists each release with its version (and the preview glyph), publication date
     when known, notes, and a
     marker for the build being run. Its header is the glyph mark beside the
     title and, under the title, an update line that follows the state —
     a state asking for action (a new version, ready to install, can't install
     yet) is itself the link, a running check or download has no link, and
     only "Up to date" or "Updates unavailable" adds "Check for updates" — so
     the notes start high and no click is described twice. The build being run leads, with its
     notes already open on the one tinted panel in the dialog — it is what the
     reader opened the dialog to learn. Every earlier version follows under
     "Earlier versions" as a one-line keyboard-accessible disclosure — bare
     chevron, version, preview glyph, how many notes it carries, date — whose
     notes stay collapsed until requested, so a long history still scans.
     Each release's lines come from its own `docs/release/highlights/v<version>.json`
     — bilingual, one glyph per line, scaffolded by `release:prepare`, validated
     by `check:docs` and required by the merge coordinator — and the changelog
     is assembled from that directory at build time, so a version is added by
     writing one file and old versions stay listed for good. The date is the
     day the version was published — its release tag's date, resolved when
     the app is built; a checkout whose tags are missing falls back to the
     day the release branch was cut. A version with nothing to tell a user (a
     pipeline-only preview) is left out rather than shown empty; only the
     build being run is always listed, and says so when it has no lines. A
     checkout between releases, with no file yet, is listed undated.
     Notes are bundled and open without a network request. A separate explicit
     action opens the application-update dialog and starts its shared remote
     check; mounting or expanding the Changelog never does. Remote update notes
     remain bounded plain text inside that dialog, separate from the local
     notes, and cannot load markup, links or images. The
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
   - application-update checks are a separate global concern. What's new (as
     the link in the update line under its title, above the local notes and never among them), More actions,
     the command palette and the Updates section of Settings all enter one
     eager dialog backed by one feature-owned controller, including when no
     project is open. Updates is its own settings section — it has state,
     actions and a dialog of its own, like Git — so it never shares General
     with the project-refresh group. Neither of its two groups is named
     after the tab. "Installed version" shows the version, then one toned
     status line (the same `.status-line` scale the Git installation row
     uses: icon and ink, no capsule, no width cap), and when there is a
     specific cause the line says the cause instead — so "why is it
     unavailable" needs no click. "Details" opens the dialog only when it has
     something the row cannot say: a release, a transfer or an install to
     confirm. The dialog says the same thing the same way: mark beside the
     title, everything on one left edge, one status line that is the cause
     when there is one. "How you get updates" holds a two-option segmented
     group, Stable / Preview, that chooses which channel to follow, with one
     sentence per option (stable is what most people should run; previews arrive earlier
     and may break). The group shows the channel a check will actually use —
     a build that has never been told otherwise reads as its own channel, not
     as a third "default" option — and is navigated like every other radio
     group: arrows move focus, Enter or Space chooses. Choosing the other
     channel is not yet a change: it opens a confirmation card under the
     group, in the install confirmation's shape (question, consequence, "Not
     now" and a focused confirm), whose consequence is the one every honest
     channel switch states — the installed version stays put, because the
     app never downgrades, so going back to Stable means waiting for the
     next stable. Escape or "Not now" leaves the channel as it was. Only
     confirming stores the choice; then whatever the old feed offered is
     forgotten and a check of the new channel starts at once, because
     choosing a channel is the question "what is there for me?". Nothing is
     downloaded or installed by the choice.
     Under it, in the same group, one switch, on by default, for the
     startup check — one bounded request when the app opens, repeated every
     24 hours only while it stays open — disclosing the GitHub contact, that
     repeat and the transmitted-data boundary beside it. A startup check that
     finds a release records an app-wide notification (info tone, collapsing on
     the version, opening the update dialog); one that finds nothing or fails
     records nothing, because "still up to date" is not an event. The dialog wears the changelog's shell and states the
     installed version before anything about the next one; a failure is its
     one explanation, never a verdict line with the cause repeated beneath it.
     Its copy never names the product and keeps each state to one short
     line. Checking never downloads; downloading never installs;
     and installation adds a final focused confirmation that explains the
     close/restart consequence. Determinate and indeterminate progress use the
     same stable region, dynamic state changes are announced, and reduced
     motion replaces the moving indeterminate bar with a static fill;
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

   **Settled direction for a project's home: the Journey page.** It is what
   Overview is built as, and the pattern any other screen that summarises
   state for a person should reach for before inventing its own. It was
   chosen after mocking up three directions against the same data and then
   fusing two of them:

   - *Dashboard* (Vercel's project overview, Supabase's home, Stripe's
     "Today"): a page header, a row of equal stat tiles where each tile is
     also the action, then two equal columns of what changes. Best density
     and the least empty space, but a row of numbers says "how is it" and
     never "what now".
   - *Property rail* (Linear's or Asana's project page): a main column beside
     a narrow list of properties. Dense and calm, but it is the shape of a
     tool for people who already know what the properties mean — the
     "manager" look the brand steers away from.
   - *Next step* (Headspace's or Fitness's home, Duolingo's path): one
     question — what do I do now — answered by a stepper with the current
     step lit and one action. The most GitOdile of the three, since change →
     save → publish is the model the product exists to teach; alone, it
     under-serves the reader who already knows Git and wants the numbers.

   The Journey page is the first and the third fused: the dashboard's header
   and columns, with the stat row replaced by the stepper. Its parts, top to
   bottom:

   - **A page header, not a card** (Linear, Vercel): the project's own icon,
     name, path, the one selector that belongs to the whole project, its
     settings. It is the only thing on the page that does not change while you
     work, so it sits on the workspace itself. The icon is the identity chip
     the rail shows for the project — chosen emoji, detected technology, or
     initials — so the project is recognised here the way it is recognised
     there, and it spends no accent: the band's current step is the page's one
     accent fill. The line selector reads as one of the band's facts, not as a
     form control — a neutral glyph circle, the caption "Version line" over
     the name, no border and no fill until it is pointed at — and the settings
     gear beside it is a bare round glyph. The header holds no bordered
     control at rest. The line's name is said there and nowhere else on the
     page: the Publish tile says "to origin" unless the destination has a
     different name, and Recent history marks the version stood on as
     "current".
   - **The band**: one card holding the steps of the model as equal tiles
     joined by connectors that turn solid as each step is reached. Every tile
     is a fact (label, value, one line) and a button in its entirety, leading
     to the screen that owns it. The tile whose action is the one thing to do
     now is *current*: ringed in the accent, its value the verb, its hint the
     reason, its glyph circle filled solid and wearing the attention
     animation. There is no separate primary button — a button inside one
     tile is a thing its neighbours would never match, and one under the band
     said the tile twice. One sentence under the band says what the current
     step means, with a quiet link only where there is somewhere to go and
     nothing to press. Every state the page can be in is a state of one of
     the tiles, so the band never needs a second card to explain itself.
   - **Two equal columns** of the lists the band's facts are about, in the
     same card shape with the same header shape (neutral glyph tile, title,
     one line, the trailing action in the same corner and the same words).
   - Nothing gets a card of its own for sometimes existing. Versions saved
     but not yet published are rows of Recent history that say so — each
     leading its meta with History's laptop glyph and tooltip, its node
     ringed in the accent, with no label row splitting the list and no badge
     on the current line's own remote copy (the glyphs already show where it
     sits),
     and "Publish up to here" appearing on a node under the pointer or focus —
     not a fourth card repeating the band's count with a second Publish
     button, and not a solid accent node on every row.

   Three rules hold it together: one accent-filled thing per page (the
   current step's glyph, or nothing when nothing is waiting), one vocabulary
   of glyph tiles (a filled circle — neutral for a fact, light for done, solid
   for do this — and never a ring), and nothing counted twice (a number is
   said on its tile and nowhere else). A screen that adopts the pattern keeps
   the same three rows and swaps the steps for its own model; it does not
   keep the band and add a fourth row of cards.

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
  --radius-identity: 28%;
  --radius-pill: 999px;
  --radius-round: 50%;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Control size states a role, not a measurement — see Size below. */
  --control-height-sm: 32px;
  --control-height-md: 38px;
  --control-height-lg: 44px;
  --control-font-sm: 12px;
  --control-font-md: 13px;

  /* Type size and weight each state a role too — see Typography below. */
  --text-hero: 28px;
  --text-display: 22px;
  --text-title: 17px;
  --text-subtitle: 15px;
  --text-lead: 14px;
  --text-body: 13px;
  --text-label: 12px;
  --text-caption: 11px;
  --text-micro: 10px;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-strong: 600;
  --weight-heading: 650;
  --weight-title: 700;

  /* Leading and tracking state a role too — see Typography below. */
  --leading-none: 1;
  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.5;
  --leading-code: 1.6;

  --tracking-hero: -0.02em;
  --tracking-tight: -0.01em;
  --tracking-wide: 0.02em;
  --tracking-caps: 0.06em;

  /* The two stacks, named once each. */
  --font-sans: ui-sans-serif, system-ui, ...;
  --font-mono: ui-monospace, SFMono-Regular, ...;

  --duration-fast: 120ms;
  --duration-normal: 180ms;
}
```

Colors should be defined semantically rather than by component:

- `--surface-app`
- `--surface-panel`
- `--surface-raised`
- `--surface-code`
- `--text-primary-color`
- `--text-secondary-color`
- `--border-subtle`
- `--accent-brand` / `--accent-brand-contrast` (the fixed lime brand mark, never themed)
- `--accent-primary`
- `--accent-primary-contrast` (text/icon color placed on top of `--accent-primary`)
- `--accent-primary-fill` (theme's solid fill for primary actions and selected controls)
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
- `--surface-card` (the fill of a card sitting *inside* a panel — a section of the History overview, a fact card on the Lines detail. A mix of `--surface-raised` into `--surface-panel`, so it resolves per theme from one definition)
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
| `--radius-round` (50%) | An atomic thing with no reading direction | Person avatar, **any single glyph on a fill** (section, status and dialog-header icons), rail destination, refresh, create, overflow trigger, checkbox, timeline node |
| `--radius-identity` (28%) | A project's identity chip — proportional, so it is the same rounded square from 20px to 56px | Rail project chip, project switcher, jump list, welcome recents, project-icon previews |
| `--radius-pill` (999px) | **Any single-line control**, a capsule of short text, or a pure geometric form | Labelled button, single-line input, search box, selector or trigger; badge, count, status chip, progress bar, scrollbar thumb, toggle track |
| `--radius-item` (10px) | A row or option that lives inside a container | Menu row, list option, file row, segmented-control option, inline code, keycap, square icon button of 24–36px that is not in an action row |
| `--radius-control` (14px) | A control that *cannot* be a capsule | Multi-line field (textarea), a frame wrapping its own options (segmented control), a preview box (a theme-picker card), square icon button of 40px and up that is not in an action row |
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

### Size

**A control's height is a token, the same way its radius is.** There is one
house size and it is `--control-height-md` (38px). A feature does not get to
pick a height; if a control needs one, it takes a tier.

| Token | What it is | Examples |
| --- | --- | --- |
| `--control-height-sm` (32px) | An action inside a row it must not out-weigh | Row actions, ghost buttons, the quick-switch create circle |
| `--control-height-md` (38px) | **Any labelled action, and its square siblings** | Every primary/secondary button, single-line inputs, refresh and overflow circles |
| `--control-height-lg` (44px) | Reached only through `pointer: coarse` | Nothing declares it directly |

Three things this settles:

- **`lg` is a pointer accommodation, not a hierarchy step.** A dialog's confirm
  is not a bigger control than the same action on a screen. Writing 44px as a
  fixed `min-height` — which four dialogs used to do — silently ships the touch
  size to every mouse user, and it is the single biggest source of the drift
  this section exists to stop.
- **Height and type size are chosen together, in the primitive.** The button
  used to declare padding and radius and nothing else, so its height came from
  `line-height: normal` over the browser's default 16px — a number nobody chose,
  and one that differs per platform's system font. `--control-font-md` (13px)
  goes with `md`, `--control-font-sm` (12px) with `sm` — the same two numbers as
  `--text-body` and `--text-label`, because a label and the control it names
  must agree. A height without a font is half a decision and the other half
  drifts.
- **Radius depends on this.** `--radius-pill` reads as half the height, which is
  what makes the concentric nesting above true for free. It is only true where
  the height is actually known, so an un-sized control quietly breaks the shape
  rules as well as the size ones.

**A measure that decides whether two screens line up belongs to the scale, not
to a screen.** Changes and History pair the same two panels — a list beside a
detail — and the same person moves between them all day. Both used to write
that geometry themselves, and had drifted: a 280px list column against 330px,
one strip height derived twice from the same `calc`, one screen giving up its
second panel 44px of window width before the other. Four values in
`tokens.css` say it once instead:

| Token | What it is |
| --- | --- |
| `--panel-column` | The list column's grid track, with `--panel-column-narrow` below 1200px |
| `--strip-height` | A panel's own strip: the row control in it plus 10px of air above and below. Each panel's header is one |
| `--strip-height-inner` | A strip *inside* a panel — the History workspace's file and diff panes — one step quieter |

Lines pairs those two panels too, and reads at the same density as the screens
either side of it. **Its rows are two lines and one height**: the name alone,
then — quieter, under it — the states worth flagging as glyphs and when the
line last moved at the trailing end. The states were
text chips first, and at 272px `Local only · Can't be deleted yet` is most of
the row; then glyphs on the name's own line, which left a long name
(`feature/windows-installe…`) half the row. The name is what the list is
scanned for, so it has the first line to itself, and every row keeps the
second line — for the date if nothing else — so every row is the same height.
As glyphs the states cost 14px each: the active line is a ringed dot in the
accent, first;
local only is a laptop; unpublished and not-yet-pulled versions are arrows with
their counts (↑2 ↓3, the convention every Git client shares); a remote branch
that was deleted is a cloud struck through, in the warning tone; the main line
is a shield in the accent; safe to delete is a tick in the success tone, and
not yet deletable a warning triangle. Up to date with its remote draws nothing,
as it always did. A glyph has to be learned, so each one explains itself: its
tooltip is a sentence (`Local only — never published, so it's only on this
computer`), the row's accessible description reads the states out in words,
and the filter panel lists the same glyphs beside their names, which makes it
the list's legend as well as its filter. `Active` is a word only in the detail
strip: the active line heads the list and the strip beside it names it, so a
chip on the row as well was the same word twice on one line of the screen.

**History's timeline rows share that shape and that vocabulary.** The subject
has the first line; under it, from the start, who saved it as initials on
their own colour, tinted rather than filled so a solo project's column stays
quiet (`.history-row__avatar`, keyed on the email so two people
with the same initials still read apart, the full name on its tooltip). The
user's own versions wear a person glyph on the neutral tint instead of their
initials — "you" is the one author never told apart by colour — with "You
(name)" on the tooltip; the detail strip says "You" with the name on hover,
as Overview's Recent history does, and names the line stood on "current",
since the status bar's "Working on" already names it. Then
come the states as glyphs, and the date at the trailing end. The author was spelled
out there before — the longest and most repetitive fact down the column — and
the states the row could not say at all. The glyphs are Lines': where you are
is the ringed dot in the accent, saved locally is the laptop, and a tag and a
merge wear their Git glyphs — the tag with its name beside it, truncated,
because which release it marks is the point of a tag; published is the unremarkable state and draws
nothing. Both lists draw them with the shared `StateGlyph` (`.state-glyph` in
`primitives.css`), so a glyph cannot look one way on Lines and another on
History, and the timeline filter's "Only unpublished" switch wears the same
laptop, as Lines' filter does, and "Only tagged versions" and "Hide branch
merges" wear theirs, so the panel doubles as the legend. Where the published
versions begin, a dashed rule crosses the column above the first of them,
naming both sides — `↑ 4 not published ── Published ↓` — with the remote on
its tooltip and the rail running through it. A single `Published to
origin/main` there read as a fact about the row above it, and a release
branch's name did not fit the column. So "what
haven't I published?" is one line to find rather than a laptop to read off
every row; nothing is drawn when every version is on one side of it. On the
current line its count is also a way to act on it: it opens the publish flow,
with its preview, as a pointer shortcut beside the toolbar's Publish.

A title reads from what changed: a Conventional Commits prefix
(`fix(settings): `) is one tone quieter than the words after it, and a merge's
whole title is, so the text is intact but neither leads. A search marks what
it matched in the title, and a row found by something it does not show — its
author, its code, a reference, its message — says where in a small accent glyph,
so no row is in the results without a reason on it. `Details` scrolls within
itself at up to 45% of the card: a long message must never push the files and
the diff out of reach.

**File lists can be read in folders.** Changes' list and a saved version's
files in History share one layout switch and one preference: a flat list by
name, or the files grouped in the folders they live in, as an IDE shows them.
The switch is a single icon after the rule in the list's search pill — the
part of the pill that acts on the list rather than on what is typed — beside
Filters in Changes; one control rather than a segmented pair, because the
Changes strip already carries the select-all box, the pill and `⋯` in ~300px.
It shows the layout in use and is pressed, in the accent, while the list is
in folders. In folders, a chain of folders that hold nothing but the next one
is one row (`src/features/history`); a folder shows how many files it holds
and which kinds of change they are, as dots, so a folded folder still says
it; a file under a folder drops its own folder line; each level steps in 16px
with a hairline under the parent. The project root's own files come last and
loose, as an IDE draws them, and keep the list's row — name and `Project root`
under it — because no folder stands over them: the switch never reshapes a
row it is not grouping. (A `Project root` folder was tried and dropped: it
added a level that grouped nothing and read as one more real folder.) In Changes a folder carries an include box
for everything under it — ticked, clear, or indeterminate for part of it. `←`
and `→` fold and unfold a folder, and stepping through the files follows the
order they are drawn in, opening a folded folder it steps into. The rows stay
one flat, virtualized list: the tree changes where a row sits, not the DOM. The pill's placeholder is short —
`Search changes` — and the field's accessible name says it in full; its two trailing controls sit tight at 22px, so the
word survives beside the select-all box and `⋯`.

**The Changes include boxes are a size down and say the usual state
quietly.** 14px rather than the shared control's 18px, closer to the file
icon: they stand on every row, and at full size with their fill the column was
louder than the names. Included — the default — is a soft ring and the tick,
with no fill; left out is an empty ring and the row itself dimmed, so the
exception is what the eye finds. The tick is the app's Lucide check, masked in the
accent with round ends, rather than two borders turned 45°, which sat half a
pixel off centre at this size. A search pill with trailing controls folds its
empty clear button away, since those controls already keep the text off the
border. The row's
accessible description reads the author and the states out in words.

**Console is a terminal across the workspace, not a panel with a terminal in
it.** It is the one screen without a card: the monospace transcript sits on
the window's own `--surface-app`, with no border or panel around it and no
screen header (the heading stays for assistive technology). A status line at
the foot, drawn as a multiplexer draws one, takes the app status bar's exact
place — 34px, the workspace insets, flush with the window's foot — so nothing
below moves on the way in. Unlike the bar it has no fade above it: the
transcript simply ends against it, and the suggestions under the prompt are
never veiled. It stands in for
the app status bar, which is hidden on this screen alone: read-only state, unsaved files with
their added and removed lines, versions to publish, newer versions available
and the Git version on the left, the keyboard hint and an icon for the shortcut
editor on the right. The line is left out because every prompt already shows
it, and clearing has `clear` and Ctrl+L rather than a button. It shows the same facts the
bar does, read-only; switching lines, publishing and project settings stay one
rail click away. The prompt takes focus whenever the screen is shown. Each query repeats the prompt it ran at, as Starship
prints one: a context line of coloured text — the project in the accent, "on",
and the line it was on in the keyword colour — and below it a bare `❯`, the
name typed, then a ✓/✗/! and the elapsed time, so every command starts at the
left edge however long the line's name is, with copy and run-again appearing on hover or focus. The exact
fixed Git command follows in the secondary colour, then the output. Output
stays inert text; tones only colour runs by the fixed query's known shape and
fall back to plain text past 400 runs; the whole transcript also shares one
budget of 400 coloured runs, spent newest first, so older output that no
longer fits is shown plain and the screen stays inside its element budget. The transcript follows its end after every command, as a
terminal does, so the next prompt is always in view. The prompt is the
transcript's last line, with a blinking block cursor (still under reduced motion), inline ghost
completion, and a listbox of matching names below it drawn like the shortcut
pane's rows — terminal type, dashed rules, the chosen name marked `❯` on a soft
wash, no card or shadow; there is no send
button. An empty transcript shows a fetch-style welcome: the whole mascot
as ASCII art generated from the icon source (64 columns printed small at
line-height 1, as fetch tools print their logos; the outline and crest in the
text colour, the plates and HEAD in the mascot's amber, the body in the brand
green under the GitOdile themes and the accent fill elsewhere, deepened toward
the text on light schemes so thin glyphs stay visible, and the white belly left
as a hole; the sunglasses have their own tones, in the text colour on a light
console and a smoked grey with white glints on a dark one, where the text
colour would draw them white) and, behind it, a dim rain of hex digits like
commit hashes, falling in the body's colour and passing behind the silhouette
(see Motion), beside a summary drawn as Omarchy's fastfetch draws one: two framed groups,
each titled in its frame and drawn in its own theme colour — "project" in the
accent (name, line, unsaved changes with added and removed lines, versions to
publish and newer ones available) and "environment" in the keyword colour
(GitOdile version, Git version, the theme actually drawn and the read-only
mode) — with a Lucide icon on every row, then a row of round dots in the
theme's accent, status and syntax colours, as a terminal's welcome shows its
ANSI palette. The dots stay loose rather than framed, since they are
decoration next to two groups of facts, but start where the frames' rows
start, under the icons. The mascot has no frame either. The frames are borders rather than box-drawing glyphs, so no font
leaves gaps in them. The transcript scrolls with the app's shared auto-hiding scrollbar (thin, no
arrows), never the platform's default one, and as terminals do it shows only
while the output is scrolled or the pointer moves over it, fading 1.2s after
and at once when the pointer leaves — the always-focused prompt does not keep
it lit. The shortcut editor
is a pane split off the terminal's foot, as a multiplexer splits one: full
width above the status line with a rule over it, the transcript giving up the
height it takes, with the transcript kept scrolled to the prompt as the pane
opens or closes. It uses the full width, in the terminal's own type: a single
header line with the title, the note, "restore defaults" and `esc`, then the
rows in as many columns as fit (name, query, quiet actions, dashed rules), the row being renamed marked `~`, and a prompt-shaped line
(`+ name → ‹ query › ↵`) to add or rename, where the query is a terminal-style
picker stepped with the arrow keys or its arrows — a spinbutton that announces
the query's name — rather than the platform's select menu; Esc cancels a rename, then closes and
returns focus to whatever opened it — the status line's icon or the prompt. No
second dashboard or persistent transcript is added.

**Lines has no page row either; the list panel's header is the screen's name.**
It follows the Work screen's shape: the list panel opens with a header at
`--strip-height` — the rail's Lines glyph in the accent and the word in the
tab's title type, the way Work's active tab is set — and its search strip
steps down to `--strip-height-inner` under it. The row that used to sit over
both panels held the name, a sentence about what a line is, and "New line";
with the docked composer under the list starting lines, it was a name the
rail already states, and the panels now start where the screen does.

Its detail panel is one surface divided by rules, not a tray of cards. It
opens with the line's strip, a fixed `--strip-height` level with the list's
header, the way History's version strip is level with its tabs: the name (and
`Active`) on the first line, who last saved to it and when on the second, one
tone quieter, and the line's actions at the trailing end — Switch as the one
labelled action, a capsule with a hairline and no fill, and Rename and Delete
as the icon-only circles History's version strip gives Details and More,
named on their tooltips (Rename's names its F2), Delete's glyph in the danger
tone. They were three grey capsules, the heaviest strip in the app beside a
list just made lighter; a labelled capsule next to circles reads as the
primary one without spending the accent, and Switch keeps its word because it
is what the reader came to do. The upstream is
not in the strip: the first state under it names it, or says there is none,
in a sentence about where the line stands, and the strip saying it again was
the panel repeating itself across a rule. **Where the line left the main line
is drawn, between where it stands and its versions** — a "Route" section,
the project map's reading in miniature for the one line selected. Time runs
to the right. The main line is the top lane in the panel's quiet ink, its
dots the versions it has saved since the two parted; this line leaves it at
the version where they parted — a ring, the date under it — and runs along a
second lane in the accent, one dot per version of its own, the ones not yet
published hollow on a dotted stretch, and a ring round the end when it is the
active line. A line that came back by a merge draws the whole excursion: it
leaves at the parting, runs its lane with the versions it saved while away,
curves back up into the main line at the merge — a filled mark, its date
under it — and the main line goes on with what it saved after. The main
line's versions between the parting and the merge sit on their own stretch,
kept off both ends. A line whose versions were always the main line's own —
fast-forwarded into it, or never saved to — never left it: it is a mark on
the main lane at its newest version, and the drawing is one lane tall; Git
keeps no record of an excursion there, and none is invented. **A line merged
by squash or rebase came back as copies**, and is drawn so: the same
excursion, its way back fainter and landing on a ring rather than a filled
mark, and the sentence saying what happened — "Its work came back on 18 Sept
squashed into one version; the 4 original versions are only on this line."
To Git the line is still away, and the drawing does not pretend otherwise:
the work is on the main line, the versions on the lane are not. It is found
by comparing changes rather than commits (`git patch-id --stable`): the
line's whole change since the parting against each of the main line's since
(squash), or each of its versions' against them (rebase) — read only, for the
selected line, and given up past a thousand of the main line's versions.
Such a line can be deleted: the delete dialog says where its work is
("already on “main”, combined into one version") and that GitOdile
keeps a local recovery point with the original versions first, and the toast
that reports the deletion says the point was kept (ADR 0016). A line whose work is nowhere else is still
refused.
**Every dot is a saved version.** Each lane is drawn from the versions the
route sends with it, newest eight at most: the dot's tooltip is the version's
subject, date and short commit, it grows a step under the pointer, and a
press opens that version in History on the line it belongs to — the route's
dots and the list of saved versions under it lead to the same place. The dots
are for the pointer only; the list is the same answer for the keyboard.
Past eight, the lane says how many earlier versions it leaves out ("+33")
over its oldest drawn dot, and the sentence under the drawing says the numbers ("Left main on 12 Sept. 5
versions of its own (2 not published yet). main has 3 new versions since."), which is
also what a screen reader hears; the drawing is hidden from it. It is measured
against the main line always, the remote's default: "where did it come from"
is asked of the main line, whichever line is active. The states over it count
against the same line — "3 versions not on main", "Already on main", for the
active line too — and while the route is drawn those two states give way to
it, since its sentence says the same count: a fact is said once. The number
and the dots are one answer;
counted against the active line they disagreed whenever the reader stood
anywhere but main. A project with no main line gets no count rather than a
count against something else in the same words. The main line itself, a
project with none, and a shallow clone — where the parting Git reports is
where this machine's history stops — draw nothing rather than a guess. The
figures come with the selected line's history read — the merge base, the two
sides' counts and their newest versions, and for a line that is back on the
main line the first-parent walk that finds the merge — never one read per
listed line. **It is read fast and waited for in place.** The questions that do
not depend on one another are asked side by side, because on Windows the
reader waits on process launches more than on the walks; and a row the pointer
rests on for a moment starts its line's read, so the press usually finds it
answered. While the read is out, a line that will have a route keeps the
section's whole place with the main lane already drawn and named, and a
text placeholder where the sentence will be — the answer grows into a
space that was waiting for it rather than pushing the versions down when it
lands. It arrives with the one motion the drawing has: the line draws itself
out of the parting, its versions appear along it left to right, the sentence
settles — about a third of a second, all of it after the answer is in, and
none of it with reduced motion. **From one line to the next it cross-fades
instead.** Two routes share most of their pixels — the main lane, its name,
the parting at a fixed place, the general shape — so blinking the section out
and drawing the next one from nothing made two similar pictures look like two
unrelated events, and it was most jarring exactly when the read was fast. The
previous line's drawing is held, quieter, while the next one is read (in
place of the empty lane), then laid over the new one and faded out as the new
one fades in, in 200ms: what the two share stays still and only what differs
dissolves — the same idea as the window's theme cross-fade. The draw-out is
kept for a route that appears where there was none. Morphing the dots and
curves from one position to the next was weighed and left: animating a
path's shape is not supported in the WebKit that GitOdile runs in on macOS,
and a transition that only works on one platform is not one to design on. It
is not drawn beside the list: the list's rows are lines ordered by name or
date, not versions, and a lane joining two neighbouring rows would claim a
kinship the order does not have. **A line is renamed in its strip,
not in a dialog.** Rename — from the strip, the row's menu, or F2 on the row —
turns the name into the field, a pill in mono with the name selected; the line
under it into what renaming does and does not touch ("Only the name changes —
it still tracks `origin/…`", the whole sentence on its tooltip), or into why Git
would refuse the name, said before the press by the composer's own mirror of
Git's rules; and the actions into Cancel and Rename. Enter renames and Escape
puts the name back. The strip keeps its height, so nothing on the panel moves.
A rename moves no saved version and no file, and the dialog it replaces was a
title, that same field and two notes over the screen that already shows the
line. The lock is taken at the press and released when the answer is in, the
composer's rule. Under the strip, where the line
stands — its states without a heading, since each
says what it is — then the versions, whose label carries "Open in History" at
its far end: the list is a preview of the sequence History draws in full, so
the way to all of it sits beside its name rather than in a footer band of its
own. The strip may grow only in a one-column window, where nothing beside it
has to be level with it. A card inside a card is two borders describing one
thing.

**A new line is named in the same docked composer Changes saves from.** The
box under the list is built and behaves as the save box does (see Changes):
a section of the panel with a hairline over it; at rest the name field — a
pill, the name in mono — with its button beside it; open, the same box grown
upward. Its plan line is where the new line starts — "Create from `main`",
known locally, so it is there from the first frame — and when the default
line and the active one stand at different commits the choice between them
is made in that line, both by name in the same mono, the default one telling
what it is on its tooltip and keeping its width while the active one's name
gives way. On a detached `HEAD` the line explains the one honest starting
point instead. "Switch to it" is a checkbox in the foot, and the button says
the consequence — "Create and switch", or "Create line" — named apart from
the dialog's own "Create", since the two can be on screen together. At rest,
where the button shares the field's row in a column under 300px, it says only
"Create", so the field's question is not cut; its accessible name is still the
consequence, and opening the box — which is where "Switch to it" appears —
shows the consequence in words beside the choice that decides it. Created,
the plan's slot says what was created. What Git would refuse in the name is said under
the field before the press, in the shared `.field-error` look, by a local
mirror of Rust's own checks (`checkLineName`: `check-ref-format --branch`
and the loaded lines, exactly or by letter case) — Rust stays the authority.
What typing on cannot fix — a space, a forbidden character, a taken name —
is said as it appears and holds the button; how a half-typed name ends
(`feature/`, `v1.`) is said only when the reader asks to create, so the box
never scolds a name for being unfinished. The field asks what the line is for
— "What will you work on?", the way the save box asks "What changed?" — and
while it is empty, the line under it says how a name is written: "Like
`fix/short-name`", one line in any language, the example truncating rather
than wrapping and whole on its tooltip — by an example
in the project's own convention when it has one (the prefix at least two of
its lines share, `fix/short-name`) and `feature/new-feature` otherwise. The
example used to be the placeholder itself, which told the format and never
the purpose; it gives way to what Git would refuse once there is a name. Nothing
in it moves: an example that types and erases itself would be a second
moving thing on a screen that keeps one. When it folds is the same shared rule
(`useDockedComposerFocus`). It is the screen's one way to start a line: there
is no "New line" in a header and no "new line from here" among the active
line's actions, since both opened a form for what the box already does. The
dialog with its full plan stays for the palette's "New version line" and the
detached-`HEAD` banner.

**The quick switch makes a line in place too.** In the status bar and on
Overview, "New line" — and a search that names no line, offered as the last
row, "Create “feature/login”" — open the composer's own fields docked at the
popup's foot, where the footer was, under the list that stays: a title row
("New line", and an × back to the footer), where the new line starts, the
name, "Switch to it", and the button that says the consequence. It docks
rather than replacing the list because the popup is measured and placed once,
for the list: a view that replaced it shrank the popup to the composer's
height and left it hanging — above the status bar, a gap opened between the
popup and its trigger. Docked, the popup keeps its size and its place and the
list gives the composer the room, as the Lines list does. Escape folds it back
into the footer and leaves the popup open. It is the same flow (`useLineCreateFlow`) in a second frame, so the
two cannot explain one create differently. A search row opens this view with
the name in it rather than creating at once — a search is a question, and
Enter on it must not make a line by accident. Made, the popup closes: the
control it hangs from names the new line, which is the confirmation. A
failure stays under the field to retry.

**The quick switch states a line's actions where the line is.** Each row carries
an always-visible `⋯` — not a hover-only affordance — that shows that line's
actions in place of the list: merging it into the current line, rebasing the
current line onto it, and comparing the two. Each names both ends so the
direction is never inferred. None is enabled yet — the flows are not built — so
each is stated, disabled and marked `Soon` rather than hidden. Renaming and
deleting a line stay on the Lines screen; the row's menu does not duplicate
them. They replace the list inside the popup rather than opening a nested menu,
because that popup clips its overflow and dismisses on a press outside itself.

**A line's right-click menu groups what other Git clients group.** Going to
it (Switch); what it can do with the line the project is on — "Merge into
“main”", "Rebase “main” onto this", "Compare with “main”", the quick switch's
own three in its words, each naming both ends — stated, disabled and marked
`Soon` until their flows exist rather than hidden; renaming it and copying its
name; and, after a rule, Delete, the one destructive action, last. The three
are offered only for a line that is not the active one: the active line has
nothing to merge into itself. Switch wears the glyph the detail strip's Switch
does, and compare its own, so no glyph means two things across the screen. The
rules between groups are `.app-menu__divider`, the one rule every menu in the
app draws — a top border, so it lands on a whole device pixel and weighs the
same in every menu at any display scale.

**The panel does not scroll; the section that can outgrow it does.** Where a
line stands is three lines that never grow, and a panel that scrolls as a whole
carries them off the top to reach the list underneath — the answer leaving to
show the question. The body divides its height between the sections instead,
and the list of versions takes what is left and scrolls inside itself, which
also keeps the way through to History against the bottom edge where a way out
belongs.

**Under the route, what the line changes against the main line.** "What
changes against main" — for a line that came back, "What it brought to main"
— compares the parting with the line's tip, the way a pull request compares:
what the main line did meanwhile is not the line's change. The totals on one
line ("23 files +1482 −356 since it left"), then the files that change most,
largest first: the glyph and colour Changes and History give a changed, new,
removed or renamed file, the file's name whole
and its folder after it, quieter and the part that gives way, the counts, and
a bar as long as the file's change beside the largest one, split between
green added and red removed. It takes the height the panel has left and lists
as many as fit, never scrolled, with the rest counted ("and 14 more files").
The saved versions, the least of the three, step down to four under it with
"208 more in History"; on the main line, which has no comparison, they keep
the height. The section keeps its place while the read is out, like the
route. Its corner says "Compare · Soon": pressing a file opens nothing yet,
because a diff between two points in a line is the Compare flow still to come.
The figures are two more read-only Git calls (`--numstat`, `--name-status`,
renames followed) in the route's own read.

**Each fact is stated once on a panel, in the place that says it best.** This
panel used to close with a Status table whose five pairs were all answered
above it — the upstream by the header, the count by the strip, the date and the
hash by the latest-version section — which in turn described in full the same
saved version the list under it opened with. A screen that repeats itself is
not thorough; it is a screen where the reader has to check whether the second
statement means something new. The upstream is named in the header, who last
saved and when in the byline, and every saved version exactly once in the list,
the newest carrying the two things only it can say: whether it is published,
and its hash. The list is eight deep where it has the panel to itself — on the main
line — and four beside the comparison with the main line, and every row opens
that version in History — the screen that draws the same
sequence in full.

**A third screen asking the same question uses the same surface.** Lines
filters a list the way Changes and History do — a trigger with a count, a
panel, groups of capsules and switches, a footer that clears them — and had a
private copy of every rule for it. The copy is what a private copy always
becomes: it had never picked up the shared sheet's fix for a `<legend>` not
being a grid item, so `Sort by` sat flush against the capsules under it where
the other two screens give it 6px. What a feature may still own is the part
only it has — here, the group listing name prefixes, which grows with the
repository and therefore scrolls, the way the file-type group in Changes does.

**A drawing has to say more than its caption does.** The strip opened with a
rail of dots — one per version the read returned, hollow at the left for the
ones behind them, `Older versions` and `Newer versions` written under its two
ends. Every line that had filled the read drew the identical picture, so the
only thing the rail could tell you was "there are more than eight", and the
count standing beside it said that in words. A diagram that needs a legend to
explain what it is, and then encodes one bit, is decoration with a caption on
it; the pixels went to who saved the last version and when.

**A state and the sentence explaining it are one line, not two.** Given the
whole measure of a panel, `Up to date with the remote — Your local line is in
sync with origin/…` reads as what it is. Stacked, it spent two lines and a gap
per state to fill a third of the width, which is how the panel ended up wanting
two columns it did not need: three short sections beside each other, and a list
of subjects truncated at half measure. The sections take the full width and the
grid is one column again.

The heights are a `calc` off `--control-height-sm` rather than sizes of their
own, for the same reason a control's height is a token: a strip is the control
that lives in it plus its air, so it cannot be right at one number and wrong at
another. There is no screen header above them to measure: Changes, History and
Lines head their list panels instead (§ Core screens, "the panel is the card"),
and the shared page row they used to open on — `.screen-header` — went with the
last of them. It had been one rule rather than a copy per screen because two
hand-written copies had already drifted: the panels beneath started 12px lower
on the screen whose header carried a button, and the same 22px title did not
measure the same on two screens. A screen that wants a page row again starts
from that lesson, not from a private copy.

There are no exceptions. There was one — the History diff pane's footer ran its
buttons at 30px, below even `sm`, on the grounds that the pane around it is a
code surface with its own measure. It went with the footer: stepping between
changes is now the same arrow pair the Changes diff header carries, in the same
place, and an icon-only stepper is not a labelled button at all. A control that
seems to need a size of its own is usually a control that has been given the
wrong shape.

A guard in `styleComposition.test.ts` fails the build on any feature rule that
gives a `.primary-button` or `.secondary-button` its own height, font size or
`min-height` — the exception above is allowlisted there by name, so adding a
second one is a deliberate edit to the guard rather than a quiet override.

### Icons

Sidebar navigation and inline controls use [Lucide](https://lucide.dev) icons (`lucide-react`, ISC) at 16–18px, imported by name so unused icons are tree-shaken out of the bundle. Chosen over hand-drawing our own because it ships real Git-specific glyphs (`GitCompare`, `GitCommitHorizontal`) instead of the generic pencil/clock metaphors the app used before — see the icon-library comparison done when this was decided. An active nav item tints its icon with `--accent-primary`; the label stays `--text-primary-color`. Don't mix in a second icon library or hand-drawn icons alongside it — pick the closest Lucide glyph even when it's not a perfect semantic match.

**Publishing is the cloud with the arrow** (`CloudUpload`), wherever the verb
appears: the band's Publish step, the node on an unpublished version in Recent
history, and the Publish buttons in the save and publish dialogs. It pairs with
the status bar, where the remote is already a cloud (`CloudCheck` when all is
well, `CloudAlert` when not), so "publish" reads as "send it up to the cloud
you can see". It replaced the paper plane (`Send`), whose ink sits low and left
of its box and never centres in a small circle. "Not checked yet" and the
states with no remote to speak of take the plain `Cloud`; "review and get" is
`ArrowDownToLine`. The changelog's `send` highlight glyph is content, not this
verb, and keeps its plane.

That rule governs **controls** — the glyph vocabulary a user learns to operate the app. It does not govern **artwork naming somebody else's product**, which Lucide has no glyphs for at all: file-type icons in the Changes list, and the stack and operating-system marks in About. Those come from the vscode-icons set already installed for file types, or — for the three OS marks, which that set does not carry — are drawn in `src/app/vendorMarks.tsx` and used nowhere else. They keep their vendor colours, because a logo reduced to one ink stops being recognizable at 14px, which is the only job it has. That is the trade: About accepts a handful of fixed colours it does not own so that nothing else in the app has to. The exception is a mark whose brand colour is an ink rather than a hue — Apple's, monochrome by its own definition, and Tux's black body, which is a hole in the layout on the dark dialog surface. Those take `currentColor` and the dialog's own surface, so they are legible in both themes; what identifies Tux at 14px is the silhouette and the yellow beak, not which side of the ink it is on.

**A project's identity icon says what the project is.** The rail, the project
switcher and the welcome recents draw one chip per project. A per-project choice
— an emoji chosen by the user, or the two letters — wins; otherwise the chip
follows the app-wide **Interface → Project icons** setting, which offers three
styles and defaults to **Technology**: the language or framework detected from
the project's own root manifests (a desktop platform such as Tauri first, then a
framework, then a language — a bounded, read-only local scan, see
`src-tauri/src/technology.rs`); **Initials**, the colour-and-initials chip the
app has always used; or **Random**, a stable emoji per project, drawn from the whole picker set, that the user
can then replace in that project's own settings. The detected mark is vendor
artwork from the same vscode-icons set with its own colours, so it sits on a
neutral tray rather than the identity colour; the emoji uses the system emoji
font and is sized from the chip rather than from the initials' text, because
bundling a colour-emoji font for a decoration is not worth the weight. A
per-project choice is stored per machine, keyed by the project, never in the
  repository, and the project's own **Project settings → Icon** section is where
  it is picked or returned to automatic. The chip is a rounded square (`--radius-identity`) — a project, not a person, and in the rail it stands apart from the round controls beside it. It keeps `--avatar-ring` and stays
  fixed across themes: the choice is identity, not theme. A closed recent
  project keeps its last detected mark across restarts; an entry never triggers
  a repository scan merely because the welcome screen appears.

Brand identity is not window furniture. Neither the titlebar nor the rail carries a mark or a wordmark: a 40px lockup at the top of the rail once spent that column's most valuable real estate on something that never changes, and a mark in the titlebar corner later did the same to the toolbar. The mascot appears where the app is being introduced or described: the no-project welcome screen and About. The compact layout below 800px adds no wordmark either; the window title and the operating system name the app.

The welcome screen shows the full mascot above its heading (144px wide): the first time in a session it draws itself and builds its history, then the commits on its crest light amber one after another up to the HEAD now and then. About shows it at hero scale with a calmer sweep of light across the lenses (see Motion). Inside the app the mascot's body and crest follow the theme (ADR 0013) while the ink outline, sunglasses, teeth and amber details stay fixed, so the silhouette is the identity in every palette. The GitOdile themes, and the system default, use the brand green `#86b640` and the deep teal crest `#0f4a43`, matching the application icon. Other themes use their `--accent-primary-fill`, lifted to at least OKLCH lightness 0.72 so the outline and glasses keep a clear edge; this matters for the dark accents of Catppuccin Latte, Solarized Light and Gruvbox Light. Their crest is a deep shade of the same accent (OKLCH lightness 0.37, chroma at most 0.09). The ink outline carries the silhouette on light surfaces and the fill carries it on dark ones.

About leads with the mascot at hero scale, then the name, then the promise, all
centred. The mascot is the full body with its theme fill, never a tile; the name
takes `--text-hero` and the promise `--text-title`, so the hierarchy comes from
the scale rather than from three ad-hoc sizes. The running app version sits
directly below the promise, and the line under it is the one thing About can
honestly say about updates — "Up to date", or whichever state
the release model is in — with the link to the changelog beside it. Preview
builds repeat the flask glyph after the version there; stable builds show only
the version. Version, channel and update line all come from the same release model
as the status bar and changelog, so these surfaces cannot describe one build
differently. The line names the state it is in — "Up to date" when the build is
current, "Not checked yet" before the first check, "Updates unavailable" when
the build carries no feed — so it is never blank, and the slot reads as a state
rather than a fault. Only a failure About cannot explain stays silent, because
an alarm with no next step is worse than a quiet line.

About opens from the titlebar's overflow menu and from the command palette. The titlebar once also opened it from the mark in the corner, the convention of clicking the identity; that route went with the mark.

### Honest affordances

A control that does nothing yet must not look fully interactive. Navigation entries for screens that don't exist yet (e.g. Changes, History, Recovery before their flows are built) are rendered `disabled` with reduced opacity and a visible “Coming soon” status, rather than looking clickable and silently failing. An upcoming primary-card action may remain visible when it makes the planned next step clear, but it must be disabled and honestly marked as unavailable. Replace the disabled state with a real view as soon as the screen exists — don't leave it disabled out of habit.

### Theming: two layers and multiple themes

Colour is two layers, and a theme is a record that fills only the second one
(ADR 0012).

**Brand identity (never themed).** `--accent-brand` and
`--accent-brand-contrast` — the fixed brand lime and its contrast — plus
`--mascot-brand-fill` and `--mascot-brand-crest` (the mascot's green and
crest in the GitOdile themes),
`--avatar-color-*`, `--avatar-foreground`, `--avatar-ring` and `--tooltip-*`,
are declared once in `src/styles/tokens.css`. No theme may set them.
`--avatar-ring` is a neutral dark edge the project chip carries so it stays
separated from the lighter panels of some community palettes (Nord, Catppuccin
Frappé) without a per-theme colour override. It is drawn in dark schemes
only — `light-dark()` against each theme's `color-scheme` — because on a light
panel every swatch already clears 4.5:1 and the edge only read as an outline.
This layer is identity, not
action: the actionable accent is `--accent-primary`, which the theme owns, so
the primary action, the notification badge, the attention halo, navigation and
focus all follow the theme rather than fighting it. The fixed lime is `#8bc53f`
with dark contrast `#14170f`, kept for brand surfaces outside the themed
workbench (the app icon and lockup), and it is never used as standalone text on
a light surface.

**Theme colour tokens.** Surfaces, text, borders, the semantic accent
(`--accent-primary`), status, diff, syntax, focus, overlay and shadows. Each
theme is a `[data-theme="<id>"]` block in `src/styles/themes.css`, which also
sets `color-scheme`, plus a record in `src/shared/theme/themes.ts`. The
semantic accent green is per scheme, like success green and diff ink: it
writes links, labels and the selected rail item, so it needs 4.5:1 on both a
warm white and a near-black surface, and no single green does both (the old
shared `#527e26` read at barely 3:1 in Dark). Light's is a deep green, Dark's
a lighter one, and the vivid lime stays as the fill of solid actions in both.
Every named theme keeps the same token set, so switching leaves no value
behind.

| Token | GitOdile Dark | GitOdile Light |
|---|---|---|
| `--surface-app` | `#0c0a09` | `#faf8f5` |
| `--surface-panel` | `#1c1917` | `#ffffff` |
| `--surface-raised` | `#292524` | `#ffffff` |
| `--surface-code` | `#201d1b` | `#f5f5f4` |
| `--text-primary-color` | `#fafaf9` | `#1c1917` |
| `--text-secondary-color` | `#a8a29e` | `#6f6a64` |
| `--surface-control` | `#24211f` | `#f4f2ef` |
| `--border-subtle` | `#38322f` | `#e7e5e4` |
| `--border-divider` | `#44403c` | `#dedad6` |
| `--border-control` | `#44403c` | `#dcd9d4` |
| `--accent-brand` | `#8bc53f` | `#8bc53f` |
| `--accent-brand-contrast` | `#14170f` | `#14170f` |
| `--accent-primary` | `#86c24a` | `#4b7521` |
| `--accent-primary-contrast` | `#0c0a09` | `#14170f` |
| `--accent-primary-fill` | `#9bd65a` | `#9bd65a` |
| `--status-success` | `#9bd65a` | `#44691c` |
| `--status-warning` | `#e8b339` | `#8a5b00` |
| `--status-danger` | `#ff6b5b` | `#b3261e` |
| `--status-danger-contrast` | `#1c1917` | `#fff7f5` |
| `--status-renamed` | `#6ea8fe` | `#2f6fb3` |
| `--accent-heart` | `#ff7a6b` | `#cc2936` |
| `--diff-added` | `#9bd65a` | `#44691c` |
| `--diff-removed` | `#ff6b5b` | `#b3261e` |
| `--overlay` | `rgba(0, 0, 0, 0.68)` | `rgba(28, 25, 23, 0.4)` |
| `--surface-hover` | `rgba(250, 250, 249, 0.06)` | `rgba(28, 25, 23, 0.05)` |
| `--surface-active` | `rgba(155, 214, 90, 0.14)` | `rgba(107, 155, 46, 0.12)` |
| `--focus-ring` | `#9bd65a` | `#4b7521` |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.22)` | `0 2px 8px rgba(28,25,23,0.06)` |
| `--shadow-md` | `0 8px 20px rgba(0,0,0,0.3)` | `0 8px 20px rgba(28,25,23,0.08)` |
| `--shadow-lg` | `0 24px 80px rgba(0,0,0,0.45)` | `0 24px 60px rgba(28,25,23,0.14)` |

`--surface-active` is accent-tinted rather than neutral gray in both themes — this is what gives the active nav item and selected segmented-control option their "friendly card" warmth instead of a flat gray highlight.

Syntax colours are in `src/styles/themes.css` with the rest; they are not
repeated here.

**The contrast contract.** `src/architecture/themeContrast.test.ts` measures
every pairing the stylesheets actually paint, in every theme, and refuses a
theme that fails one:

- Primary and secondary text at 4.5:1 on every surface text sits on: app,
  panel, raised, code, control, the card, a hovered row, a selected row and
  the accent wash.
- Accent, status and diff colours at 4.5:1 on app, panel, raised and card,
  because each of them is written as words somewhere (a link, a "saved
  locally" label, a status chip, the status-bar diff stat).
- A solid button's label at 4.5:1 on its fill. Buttons are 12–13px bold,
  which is not WCAG "large text", so the 3:1 large-text floor does not apply.
- Diff ink at 4.5:1 on its own tinted line, and syntax at 4.5:1 on the code
  well and on both kinds of tinted line; the comment, muted on purpose in
  every editor palette, at 3:1.
- The 3:1 non-text floor for the accent glyph on a selected row, the focus
  ring on every surface it can land on, and the heart.
- Secondary text measurably quieter than primary (at least 1.25:1 between
  them), and in dark themes a raised surface lighter than the panel, so a menu
  lifts off the page instead of reading as a hole in it.

Selected text (`::selection` in `base.css`) is a 24% tint of the accent fill
written in primary text, the strength at which that text still clears 4.5:1
on every surface of every theme.

**Official themes.** GitOdile Light and Dark are the two records that carry the
brand palette above; they are the default and the pair "match device" resolves
between. They are not a starting point that community themes replace.

**Community themes.** Only palettes with a canonical, attributable source are
admitted (Catppuccin Mocha, Latte and Frappé; Nord; Tokyo Night; Dracula;
Solarized Dark and Light; Gruvbox Dark and Light). Their published surfaces
and hues are the starting point; the mapping onto GitOdile's extra roles —
diff, syntax, renamed, heart — is ours, and where a published hue cannot pass
the contract above it is lifted (dark) or darkened (light) along its own
lightness until it does, keeping the hue. Each block in `themes.css` names
the values that moved and why. A palette without a canonical source (for
example Vercel/Geist, which is a design system) is not admitted, because a
"theme" for it would be invented colours. A variant too close to one already
shipped is not admitted either: Catppuccin Macchiato sat between Mocha and
Frappé, and the picker showed three cards nobody could tell apart. A stored
Macchiato preference lands on Mocha.

Status colours keep their meaning across themes, but they mark *status*, not
*progress*: a completed journey step, its connector, and a celebratory
all-clear use the theme accent with neutral text, never success green, so the
progress band never fights the palette. Success green stays on chips,
confirmations, diff categories, and genuine status marks.

Theme resolution order (highest priority first):

1. An explicit theme, persisted locally and applied immediately.
2. "System" (the match-device preference), which resolves to the official Light or Dark from
   `prefers-color-scheme` and follows it live through the media query.

The user must always be able to return to "System", so an explicit choice
never silently strands them on a theme that has drifted from their OS setting.
A pinned community theme has no official counterpart, so the titlebar toggle
hands control back to the device — its glyph becomes the monitor, matching
"System"; from the device or an official theme it flips between the
official light and dark. "System" and every named theme stay reachable
from Settings > Interface > Theme and the command palette. The picker shows
each theme as a miniature of the app in its own tokens, with the scheme carried
by a glyph and by the option's accessible name, never by colour alone. Each
option is a bordered card in the project-icon picker's language, with a 16:10
miniature and the name beneath it; the official cards carry a verified rosette
in `--accent-primary` right after the name — a seal, not a check, because
selection is the accent border.

Do not introduce a color anywhere in the product (status badges, diff
highlighting, charts, mascot variants) without first checking whether it is
expressible through an existing token; new one-off colours fragment the theme
story.

## Brand and mascot

Working brand: **GitOdile**.

Mascot: a stylized crocodile that feels clever, calm, and trustworthy, with
dark sunglasses that give it a relaxed, confident personality — a bodyguard
for your work, which is the product's promise (ADR 0018).

Visual traits:

- a seated crocodile with a long snout, a rounded crest, a white belly, short
  arms and green feet;
- green body `#86b640`, one even ink outline `#13251f`, wayfarer sunglasses
  with two white glints that hide the eyes;
- the crest is a commit graph: rounded dark-green humps `#0f4a43` threaded by
  an amber line `#e7b448`, white commits on each hump and a larger amber HEAD
  at the neck;
- no mouth line: four white teeth, growing toward the tip, hang from the jaw;
- three amber plates on the belly;
- not overly detailed or child-oriented: the eyes, outline and colours were
  pulled back from the rounder, brighter first drafts on purpose.

The mascot may appear in:

- application icon;
- onboarding;
- empty states;
- success and recovery moments;
- documentation and marketing.

Do not place the mascot in every panel or use it to trivialize serious errors.

**Application mark:** there is one drawing, and every surface crops it:

| Crop | Where | File |
| --- | --- | --- |
| Body | welcome screen, About dialog, the console welcome's ASCII mascot, brand material | `src/assets/gitodile-mascot.svg` |
| Head | brand material | `src/assets/gitodile-mascot-head.svg` |
| Portrait | the application icon, at every size and on every platform | `src/assets/brand/gitodile-icon.svg` |

The application icon is the same everywhere: the portrait (crest to snout tip
across, the body running off the bottom edge) on a rounded tile with a vertical
amber gradient, `#fbe3a0` at the top to `#e0a032` at the bottom. Amber is the
mascot's own accent, so the tile makes it the brand colour, and it stands out
on light and dark desktops alike. Windows and Linux take the icon filling the
canvas; macOS takes the identical icon on Apple's 824px grid
(`src/assets/brand/gitodile-icon-macos.svg`) and adds its own shadow. The tile
carries no drawn glow, highlight or shadow. The 16–32px sizes are the same
portrait, downsampled: the sunglasses carry recognition there. The Windows
installer's side panel shows the tiled icon on the warm white of the light
theme. Inside the app the body's green follows the theme (see the welcome
screen under "Icons" above).

`scripts/icons/mascot.mjs` is the single source for the drawing: it writes
the SVGs, the element tree the in-app mark renders (`src/shared/ui/mascotArtwork.ts`),
the mascot's ASCII art for the console welcome (`src/features/console/mascotAscii.ts`)
and the icon sources, and `pnpm icons` regenerates every packaged icon and the
brand PNGs under `src/assets/brand/png` (the icon at 16–1024px, the macOS icon,
the mascot and the head) from it (see "Application icon and Windows shortcuts"
in `docs/ARCHITECTURE.md`). Never edit a generated SVG or PNG by hand.

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

### Size

**Type size is a token, the same way a control's height is.** Pick the step by
what the text *is*, never by how big it needs to look on the surface in front of
you — that is what let one screen drift a whole step below the rest while every
value in it looked locally reasonable.

| Token | What it is |
| --- | --- |
| `--text-hero` (28px) | A name, not a heading: the app's, the project's. One per surface |
| `--text-display` (22px) | The screen's own title (`h1`), and a figure meant to be read at a glance |
| `--text-title` (17px) | A card, dialog or section heading (`h2`) |
| `--text-subtitle` (15px) | A heading inside a card (`h3`) |
| `--text-lead` (14px) | The name of a row, where the row *is* the content |
| `--text-body` (13px) | Body copy, and any labelled control (`--control-font-md`) |
| `--text-label` (12px) | A label, and a control living inside a row (`--control-font-sm`) |
| `--text-caption` (11px) | A chip, a count, metadata beside a name |
| `--text-micro` (10px) | The floor: an avatar's initials, a badge's number |

**Whole pixels, and these particular ones.** The steps are not house taste; they
are where desktop software has converged, and they were checked against it:

| | Body | Secondary | Floor | Section heading | Screen title |
| --- | --- | --- | --- | --- | --- |
| [macOS HIG](https://developer.apple.com/design/human-interface-guidelines/typography) | 13 | 12 / 11 | 10 | 15 / 17 | 22 |
| [Windows 11 / Fluent 2](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography) | 14 | 12 | 12 | 20 | 28 |
| VS Code | 13 | 12 | 11 | — | — |
| [GitHub Desktop](https://github.com/desktop/desktop) | 12 | 11 | 9 | 14 | 28 |
| [GitButler](https://github.com/gitbutlerapp/gitbutler) | 12 | 11 | 10 | 13–15 | — |
| **GitOdile** | **13** | **12 / 11** | **10** | **15 / 17** | **22** |

22/17/15 is the macOS title ramp and 13/12/11/10 its body ramp, which is also
where VS Code, GitHub Desktop and GitButler land. Fluent's 14px body and 12px
floor belong to a general-audience, touch-capable ramp; every dense developer
tool in the table sits below it, and so do we.

The scale used to run half a pixel above all of them — 13.5, 12.5, 11.5, 10.5 —
because five steps had been squeezed into the four the ramp has. No established
ramp uses a fractional size, and a fractional one also sits worse on the pixel
grid at small sizes. `styleComposition.test.ts` fails the build on a non-integer
step.

**`--text-*` is a size, always.** The two text *colors* carry a `-color`
suffix — `--text-primary-color` and `--text-secondary-color` — because they
predate this scale and would otherwise read as steps of it. So `var(--text-label)`
is a size and `var(--text-secondary-color)` is a color, and you can tell which
without looking either one up. Every step here is named for what the text *is*
(`body`, `label`, `caption`), never for its prominence.

`--text-micro` is a floor, not a step to reach for. Below it the app was running
8.5px and 9px secondary text, which the Accessibility section already forbids.

Three things sit below the floor, and all are named in the guard rather than
left to judgement. `.sidebar-project__badge-count` is a numeral inside a 14px
status dot, which leaves a 10px box once the ring and padding are out;
`.navigation-display__preview small` is a label inside a miniature *drawing* of
the navigation rail, where the text is part of the picture rather than something
anyone reads; and `.console-art` is the console welcome's ASCII mascot, whose
characters are the picture's shading at 7px, not words. None is prose. Adding
another is a deliberate edit to the guard, not a quiet override.

### Weight

**Five steps, and each of them is a role.** Anything in between is a number
somebody eyeballed.

| Token | What it is |
| --- | --- |
| `--weight-normal` (400) | Body copy and metadata |
| `--weight-medium` (500) | A value that must not be mistaken for a name |
| `--weight-strong` (600) | The name of a thing: a file, a version line, a row's subject |
| `--weight-heading` (650) | A heading, and the label of a selected control |
| `--weight-title` (700) | A screen or dialog title, a primary action, an avatar's initials |

Two things this settles:

- **Semibold, not bold, carries emphasis.** Fluent states it outright: bold is
  not part of the Windows type ramp, and Semibold is what emphasis uses. That is
  what `--weight-strong` is.
- **`<strong>` is a semantic mark, not a request for a weight.** Left to the
  browser it lands on 700 — the loudest step the app owns. History reached for
  it on every filename, count, value and area total, so the densest screen in
  the app was also its boldest, and no single rule looked wrong. `base.css`
  pins `strong`/`b` to `--weight-strong`; a surface that genuinely needs more
  says so itself.
- **A heading is never heavier than the screen title.** `h2` and `h3` carry
  `--weight-heading` from `base.css` rather than the browser's bold, and their
  sizes come from the scale, so an un-styled heading is never a 24px guess.

The drift this replaced: History ran 630, 680 and 760 while every other screen
sat on 600/650/700 — including the *same* commit row, which Overview renders at
650 and History rendered at 680.

### Leading and tracking

The same idea on the last two axes. Every ramp in the table above pairs a line
height with each *size*; ours pairs one with each *role*, which survives a size
change — the size pass moved every number in the app and not one line height had
to follow.

| Token | What it is |
| --- | --- |
| `--leading-none` (1) | A glyph centred in a box of its own: a count, an avatar's initials |
| `--leading-tight` (1.2) | A heading — the bigger the type, the less air it needs |
| `--leading-snug` (1.35) | A name, or a row that may wrap to a second line |
| `--leading-normal` (1.5) | Body copy and prose |
| `--leading-code` (1.6) | A monospace *surface*: a diff, a code block, an editable file |

| Token | What it is |
| --- | --- |
| `--tracking-hero` (-0.02em) | The largest type on a surface |
| `--tracking-tight` (-0.01em) | A heading |
| `--tracking-wide` (0.02em) | Small text opened out: initials, a count |
| `--tracking-caps` (0.06em) | An uppercase label |

Wrapping is set once, in `styles/base.css`: the body takes
`text-wrap-style: pretty`, so a sentence that needs two lines never leaves one
word alone on the second, and headings take `balance`, so two lines split
evenly. Both are the longhand, which leaves `text-wrap-mode` alone, so a
surface's own `nowrap` still wins. A setting's description takes all the width
its control leaves (a switch leaves most of the row; there is no `ch` measure
on it) and is one plain paragraph that wraps where the width runs out, like
every other text in the app. Never split copy into one line per sentence or
per clause, with inline blocks, `<br>` or a component: the lines come out
uneven and the text reads as a list rather than a sentence. When a hint wraps
badly, shorten it. Descriptions are written to fit one line.
None of this is a reason to write long copy: the first fix for a wrapped hint
is a shorter hint (see Content design).

### Family and figures

`--font-sans` and `--font-mono` name the two stacks. Before them the monospace
stack was spelled out verbatim twelve times, so adding a fallback meant finding
all twelve. TypeScript had already understood this — `SYSTEM_MONO_STACK` in
`features/changes/diffPreferences.tsx` builds the diff's font preference and has
to spell the stack out — so a guard compares that constant against the token and
fails if they drift.

**A figure read against a sibling takes tabular figures.** A column of counts, a
row of stats, a badge whose number updates in place: without
`font-variant-numeric: tabular-nums` the digits are proportional, so the value
shifts sideways as it changes and a column of them never lines up. Changes
already did this for its diff totals; History rendered the same two numbers
without it, alongside four other figures that wanted it.

Two distinctions worth keeping:

- **A code surface is not the same as monospace text.** A diff, a code block and
  the ignore-file editor take `--leading-code`; a branch name or a file path
  that merely happens to be monospace is a *name*, and takes `--leading-snug`
  like any other. Deciding this by font family rather than by role is how the
  same list ended up at 1.35, 1.4 and 1.45 in one sheet.
- **`letter-spacing: 0` is a reset, not a step.** The tooltip uses it to shed
  whatever tracking it was rendered inside of, and the guard allows it.

The drift this replaced: twelve line heights for what were only ever four roles
plus code, and eleven tracking values — among them −0.005, −0.012 and −0.018em,
which at the sizes they were written on differ by about a fifth of a pixel.

`styleComposition.test.ts` fails the build on any literal `font-weight` or
`font-size` anywhere in the eager cascade — inside the `font:` shorthand too,
which is where six rules had been hiding from both guards — on a fractional step
in the tokens, on `--control-font-*` drifting from the text step it must match,
on any literal `line-height` or `letter-spacing`, on a font stack spelled out
in a feature sheet, on the TypeScript mono stack drifting from `--font-mono`,
and on a `<strong>` left to the browser's bold. Every sheet is on the scale: the
pass that got them there moved 248 declarations spread across twenty-two
distinct values — 14.5, 16, 18, 20 and 21 among them, each reasonable where it
was written and none of them agreeing with the next sheet over.

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
- a theme change cross-fades the whole window at `--duration-normal`, from
  every control that offers one — the titlebar toggle, Settings and the command
  palette. The point is that the whole surface changes together, rather than the
  background fading while the panels on top of it snap. The titlebar toggle once
  had its own circular reveal anchored on the button, on the theory that a change
  caused by one control should look like it came from there; it was withdrawn,
  because a curve that paces a position does not pace a radius, and "system" —
  which Settings offers — has no origin to sweep from anyway;
- avoid large spring animations in work surfaces;
- respect `prefers-reduced-motion`;
- Appearance settings offers an app-specific **Reduce motion** switch, off by
  default. When enabled it removes GitOdile's transitions and animations while
  keeping every state change immediately visible; the operating-system
  preference is respected independently and never needs this switch to be on;
- never delay an operation solely to show an animation;
- **one animation asks for attention, everywhere it is asked for:**
  `.attention-breathe` (primitives.css, tuned by `--attention-duration`,
  `--attention-spread` and `--attention-color` in tokens.css). A halo leaves
  the element, fades to nothing by its full reach and is reborn at the edge —
  it is only ever seen going out, never coming back in; nothing inside the
  element moves and no layout shifts, so the same class fits a 40px tile and
  an 18px badge. It was chosen over a scale pulse (moves the text around it),
  sonar rings and a heartbeat (insistent), a glow (neon in dark mode) and a
  sheen or orbit (need room the small cases do not have). Overview's active
  step wears it today; a badge for something new or an update that is ready
  would wear the same one. A surface re-points its colour, never its shape.
  **The notification dot is the same halo made finite.** `notification-dot-
  breathe` is a closed set of three breaths rather than an endless loop,
  because the titlebar is chrome the reader sees all day and a pulse that never
  ends stops meaning "something happened" and starts meaning "ignore me". It is
  a second keyframe only because it must carry the dot's surface ring in the
  same `box-shadow`; it is not a second idea, and it follows the same rule —
  started in the component only when reduced motion is off.
- **The mascot moves differently in each brand moment**
  (`Mascot`'s `motion`, primitives.css). About uses `sweep`: two slanted
  white bands, clipped to the lenses, cross them in under a second and rest
  for about six — calm, for a card someone reads. The no-project welcome
  uses `commits`, opened once per session by `entrance`: the mascot draws
  itself and builds its history. Its outline traces in 0.7s, in the text
  colour because its own ink would vanish on a dark theme; the colours fade
  in over it while the outline turns ink; then the commits pop in from the
  tail to the neck and the HEAD last, about 1.6s in all. The entrance used to
  be a hop inherited from v3, which read as cheap on the v4 drawing; drawing
  and filling suit a mark that is a history of commits. After it, and on
  every later visit without it, the six white commits on its crest turn amber one after another, from
  the tail to the amber HEAD at the neck, each swelling as it lights and
  breathing back to size; the HEAD answers with one breath and the commits
  fade back to white, every 6s. It shows
  what GitOdile keeps — your history, up to where you are now — and neither
  place moves constantly. The console welcome is the third brand moment:
  behind its ASCII mascot, short columns of hex digits, like commit hashes,
  fall through the art's box at 3–7s each (a terminal's digital rain), dim,
  in the body's colour, fading toward their top and passing behind the
  silhouette, belly included. The rain dissolves at all four edges of the
  art's box rather than stopping at them: the mascot has no frame, as a
  fetch tool's logo has none, so nothing would justify a hard edge. It runs while the welcome shows, so it stays
  sparse and faint, is CSS only, and stops with the console when the screen
  is hidden. These are the only decorative animations GitOdile allows, and
  only in these three places; the rest of the workbench never decorates. The
  system and app reduced-motion settings remove them; the mascot then shows
  still.

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

The shortcut sheet follows them. It lists the app-level shortcuts and groups
them, and it draws each key in the platform's own form — `Ctrl`, `Shift` and
`Esc` spelled out on Windows and Linux, `⌘`, `⇧` and `esc` on macOS — under a
header tile that wears the platform's mark, so what it shows is the keyboard the
reader actually has. Pointing at a row taps its keys in the order they are
pressed instead of selecting the label, and the motion is withdrawn under
reduced-motion.

### Pointer cursors

Follow desktop rather than browser cursor conventions. Standard controls —
buttons, menus, selectable rows, checkboxes, navigation, and dropdowns — keep
the system arrow and communicate interactivity through shape, hover, pressed,
selected, and focus states. Disabled controls also keep the arrow; reduced
opacity and the disabled interaction state carry that meaning.

Reserve the pointing hand for real links and text actions deliberately styled
as links, where the cursor helps compensate for their lighter affordance — the
Save version detail disclosure, About's update link, About's licence and
source links, a dialog's inline way out (`.app-dialog__link`) and a toast's
action. Use
special-purpose cursors only when they describe the operation itself, such as
text selection, resizing, dragging, progress, or a forbidden drop target. A
guarded list in the style-composition audit names every control allowed to take
the hand, so this stays a decision rather than a habit.

## Dialogs

Every dialog that asks or tells — create, clone, save, publish, get project
changes, discard and restore, the version-line dialogs, updates, the app's
messages and the issue report — wears one shell: `Dialog` in `shared/ui`
(`.app-dialog`). About, What's new and the shortcut sheet are documents to
read rather than questions to answer and keep their identity shell. The shell
exists because the dialogs had drifted to seven widths, four paddings, borders
on some and not others, and three different headers; a new dialog takes the
shell and a size, never a width of its own.

**Three sizes, by what the dialog holds.**

| Size | Width | For |
|---|---|---|
| `s` | 440px | A message, an error, a confirmation, a result with a next step: discard, delete a line, switch lines, a new line, close a project, anything that failed |
| `m` | 560px | A short form or a plan: save a version, publish, updates, connecting a remote |
| `l` | 720px | A flow with a review or lists: create a project, clone, get project changes, the issue report |

A flow may change size between steps — its failure or its result is a short
message in `s` — but a dialog never picks a width outside the three. All three
take 28px of padding, a 1px `--border-subtle` border, `--radius-surface`,
`--shadow-lg` and one `--space-4` gap between parts.

**One header.** The title (`--text-display`, one line), the close button
always, and nothing else unless the dialog needs it:

- The circular glyph leads the title in `l` flows and in every message whose
  tone matters before the sentence is read — an error (`danger`), a warning or
  a block (`warning`), a result (`success`), a cancellation (`neutral`). It
  sits **beside** the title, centred on the same axis as the title and the
  close button, never above it: a glyph on its own row pushed a two-line title
  into the space the close button left.
- The subtitle belongs to the step it describes. A flow's first step says what
  the flow is ("Download a copy to this computer and open it"); later steps
  replace the title and drop the subtitle ("Review before cloning", "Cloning
  “project”…"). A title and subtitle that never change stacked four levels of
  text above every review.
- The close button goes away only while work that cannot be interrupted runs,
  and the backdrop and Escape follow it. Initial focus never lands on it.

**Titles fit one line.** In `s`, with the glyph beside it, that is about 24
characters; the fix for a long title is a shorter title, not a smaller type
size or a stacked header. The detail moves to the body: "Can't delete it yet"
over "“feature/x” has versions that aren't anywhere else", not the name inside
the title.

**The body is secondary ink at the body size** (`.app-dialog__text`), and the
title is the one strong line. What the dialog will do is said as a short list
of facts (`DialogFacts`) — two or three lines with a glyph each, the line that
says what stays safe last, in the success tone. It is never a grid of titled
cards: four cards of equal weight made "nothing is deleted" read like "sign-in"
and the dialog like a feature page. Mechanism — temporary folders, refs,
tokens, `.git/config`, a HEAD — goes behind a `Technical details` disclosure,
if anywhere.

**Conditions and failures are banners** (`DialogBanner`): `danger` for a
failure, `warning` for something to fix first, each with its way out inside it
as a text action ("Add in Settings", "Save without hooks just this once").

**Actions sit on the right, dismiss first and the title's verb last.** Every
form, confirmation and plan has `Cancel` beside its primary action, including
destructive ones — a confirmation whose only visible button is the destructive
one reads as "press this to continue". The primary repeats the verb of the
title ("Save version", "Create line", "Delete line", "Publish changes"), and
carries an icon only when it is one of the vocabulary's verbs (save, publish,
get, discard, delete). **Anything that removes work is `danger-button`** — the
brand green is for the constructive choice, and a delete in green said the
opposite. A note that belongs to the action ("Only on this computer until you
publish") takes the left of the same row. A choice made for this action alone
is an `app-checkbox`; a switch is for a setting that persists. Placeholders are
set in the sans even where the value is set in the mono.

**A result with no next step is a toast, not a dialog.** A published change, a
line switched, created or deleted, a discard (whose toast carries `Undo`),
a restore, a remote connected: the dialog closes and `useToast` says what
happened, under the window, for a few seconds (paused while pointed at or
focused). A result stays a dialog only when it offers something — a saved
version offers Publish, a created project offers connecting a remote.

**A dead end offers the way out, not a retry.** "Nothing to save" and
"Everything is already published" offer `Close`: retrying cannot change them.
A block that only the reader can lift offers the action that lifts it
("Save your changes" → `Save version`). `Try again` is for failures that a
retry may actually pass.

**A plan that is still being read opens in its final shape.** The dialog
appears at once with its title, `Cancel` and its primary action — held back
until the plan is in — and faint text placeholders (`.text-placeholder`) where
the plan's sentences and rows will be (see "A first load draws the shape" under § Core screens); a fact that holds for every
plan, such as who will see a publish, is shown for real. A separate
"Checking…" dialog that another dialog later replaced read as two events for
one click, and moved every control once it landed. **What the project already
knows may stand in for the placeholders.**
Publish opens on the session's cached pending list — the remote as of the last
check — with its primary held back as "Checking the remote…" until the fresh
plan arrives and decides: a different count replaces the preview's, and a
block replaces the whole plan. Without a tracked branch there is nothing
trustworthy to preview, and the placeholders stay.

**Progress is three steps at most.** The native side may report six phases;
the dialog maps them onto the few the reader can follow ("Downloading",
"Checking", "Opening") in `.app-dialog__steps`, the active one spinning and the
done ones ticked.

**Copy follows § Content design**, with one addition for dialogs: the text a
dialog shows is written in `translations.ts` from facts the native side
returns. A sentence built in Rust arrives in English whatever the reader's
language, so the native side sends codes and data, and the updater only shows
its English safe detail to an English reader.

## Account and sign-in

A GitOdile account is optional and only unlocks Pro or connected services
([`BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md)); the mechanism is
[ADR 0016](docs/adr/0016-sign-in-through-the-system-browser.md). The design
consequence is one rule: **the app never shows a credential field.** Email,
code and provider sign-in all happen on GitOdile's web page in the system
browser, so every surface below either explains, waits, or confirms.

The flow has four steps, and a new entry point (a Pro feature, Settings) joins
it at step 2 rather than inventing its own:

1. **Account popover.** The rail's account control opens a popover anchored to
   it (`--radius-surface`, `--shadow-lg`), never a modal: signing in is
   optional, so asking about it must not interrupt anything. It carries a
   title, one line saying local work is unaffected without an account, at most
   three concrete things the account adds, and one accent-filled "Sign in"
   button. The line under the button says the sign-in continues in the
   browser; that sentence replaces a separate "Open browser" screen, because
   the consequence is stated before the click.
2. **Waiting dialog.** The click opens the browser immediately and the app
   shows a size `s` dialog: "Waiting for the browser…", the request code in
   `--font-mono` on `--surface-code` (the web page shows the same code, so the
   user can match the tab to the request), and three steps — browser opened,
   sign in, back in GitOdile — with the current one marked by the ring and a
   spinner that stops under reduced motion. Actions: "Cancel" (quiet) and
   "Open again" (secondary), for a browser that opened behind the window or in
   another profile. Nothing in the dialog is accent-filled; the only thing to
   do happens elsewhere.
3. **Web sign-in page.** Outside the app, but it uses the same tokens, shapes
   and mark so the hand-off does not feel like a different product. One card:
   the request row (platform and code), "Continue with GitHub" and "Continue
   with Google" as secondary pills, then email with "Send me a code" as the one
   filled button, because it is the only method that asks for typing. There is
   no separate sign-up — a first sign-in creates the account, and the card says
   so. The code step uses six single-digit boxes (`--radius-item`), a resend
   countdown and "Change email". The finish page says the user can return to
   GitOdile and close the tab; it offers no "Open GitOdile" button, because the
   app receives the session by itself.
4. **Back in the app.** The waiting dialog closes by itself, the window comes
   forward, and a brief notice confirms "Signed in" with the plan in one line.
   The rail control becomes the person's avatar (round, with
   `--avatar-ring`), and from then on opens a popover with name, email, a
   `PRO` capsule when entitled, and menu rows: plan and billing, what the
   account stores, sign out.

**Failure never implies lost work.** Every account error is a sentence of what
happened and what to do, followed by the reassurance that projects and saved
versions are unaffected: no connection ("Try again when you're online"), the
browser closed before finishing ("Nothing changed in your account or your
projects"), a sign-in that expired. None of them is `--status-danger`-filled;
they use the notice treatment, and "Not now" is always an equal way out.

Wording: "account", "sign in", "sign out" — never "log in", "register" or
"create an account", since creation is implicit. Name the browser step
honestly ("continues in your browser") and never say "securely" or "seamless".

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

**A hint fits on one line; a note says one thing.** Most copy sits in a narrow
column under a label, so every extra clause becomes a second line of grey text
that nobody asked for. Say the consequence and stop: the reason behind a
safety measure belongs in the ADR, not under the switch. Prefer one sentence,
even a slightly longer one, over two short ones: two facts that belong together
join with a comma or "and" (“Only remote information is read, and your files
don't change.”). Start a second sentence only when the note truly needs one,
never to chop a thought into fragments, and never join with a semicolon or a
dash. The usual case that does need one is a fact followed by what to do
about it (“Couldn't reach GitHub. Check your connection and try again.”): a
statement and an instruction don't join well. How GitOdile proves something
is safe (ownership markers, staging folders, state tokens) is implementation,
never copy; say what stays safe instead.

**One voice across both languages.**

- An error names what failed without a subject: “Couldn't read this file.”,
  not “We couldn't…” or “GitOdile couldn't…”. Name GitOdile only to tell it
  apart from Git or from the user.
- English is American (“favorites”, “color”), and names in running text sit in
  curly quotes: “main”. The apostrophe is the straight one (`couldn't`,
  `file's`), never `’`: the two look alike on screen, so a mix goes unnoticed
  until a test searches with the other. `copyTypography.test.ts` enforces it.
- Spanish is Spain’s: *ordenador* for the computer, always, because *equipo*
  already means the team (“tu equipo la sigue viendo”). Get project changes is
  *Traer cambios del proyecto*, retry is *Reintentar*, done is *Listo*, and
  names sit in angle quotes: «main».

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

**A render error never blanks the window.** Each screen, each Work tab and
the app itself sit inside an error boundary. A failure shows the error form of
the empty-state block in the place of what failed — "This view ran into a
problem", a sentence that the project was not touched, `Try again`, and the
technical message behind a `Technical details` disclosure — while the rail,
the status bar, the other screens and the Work tab pair keep working. Outside
every screen, the window's own notice offers `Reload window`.

Reuse one visual pattern for all of these across screens rather than each screen inventing its own: a centered block with a small icon in a bordered/shadowed circle (`--radius-round`, like every glyph tile), one short headline, one line of supporting copy, and 1–2 actions — see `.empty-state` in `src/shared/ui/primitives.css`, first built for the "no project open" Overview state. An error state swaps in `--status-danger`. Loading is not this block: it draws the content's own shape, below. Do not build a bespoke illustration or a different card shape per screen — that's how a "no repository" panel and a "no results" panel end up looking like they belong to two different apps.

**A first load draws the shape of what is coming, where it will be.** A list,
a sentence or a form whose shape is known before Git answers — the Overview's
changed files and recent history, the Changes file list, the History timeline
and a version's detail, the version lines and a line's route, project
settings, line endings, the Publish plan — renders its real layout with
`LoadingPlaceholder`: the same row classes as the loaded content, real
structure (a timeline's rail and nodes, a panel's own header) drawn as it will
be, and a faint `TextPlaceholder` for each run of words. The answer then lands
in a space that was waiting for it and nothing moves. The placeholders draw
only the shape: no count, name or state is guessed before Git has answered.

**Nothing shows for the first 320ms.** Most local reads answer inside that,
and a placeholder that flashes for a frame before the content is a flicker,
not progress. The delay holds under reduced motion; only the fade and the
pulse go.

**Content whose shape can't be guessed keeps the loading bar** (`LoadingBar`):
a diff, a screen whose code is still loading, an older page being appended.
**A refresh keeps what is on screen** and says so where it is — the card's
icon turns, a bar runs over the list, the status bar's item spins — and never
swaps back to placeholders. **A control doing work carries a spinner** beside
its verb ("Publishing…"), at the control's own size.

The Overview used to spin a spinner in each card while Changes drew the bar
over the same wait; one wait now looks the same wherever it is.

**The welcome screen is the one documented departure, and it departs in one
direction only.** Screen 1 is a front door, not a "nothing here" report: it has
three peer entry points — create, open, clone — where the pattern allows one or
two, and as capsules their labels wrapped to three lines *inside* the pill,
because a capsule is a single-line control by definition (§ Shape). It keeps
the block, the headline and the one supporting line, and replaces only the
action row with a launcher: one card per action (`--radius-surface`), each a
filled glyph circle — the same 40px tile Overview heads its cards with, no ring,
lit in the light accent only under the pointer — with its label and a one-line
hint underneath, reusing the
add-project menu's own icons so both routes to the same three flows look
related. The pattern's own glyph tile goes away there rather than becoming a
fourth circle above three, and **the three read as peers**: same tile, same
weight, no accent on any of them. The old row had one green pill and two grey
buttons, so the shape carried a recommendation; as cards it would be a claim
the screen cannot support, since which action is right depends entirely on what
the user already has on disk. The hint under each label answers that, and it
answers it better than a colour that only says "this one".
The Projects screen can be revisited with projects open. Its heading then asks what to open,
its recent list excludes projects already open in the switcher, and neither
the switcher nor the rail marks a current destination. Back returns to the
project screen that led here; Forward can revisit Projects until another navigation.
The status bar continues to show the active project's name, working-tree and
remote state, and available project actions. With no project open, it shows
the no-project state. The mascot's entrance plays once per application session; later
visits keep the periodic wave of commits without another entrance.

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

Once there is a favourite, the list's heading carries the quick switch's own
favourites filter — a bare star that fills when pressed, listing favourites
only. It is a view rather than a setting, and it is absent until there is a
favourite to filter by, because before that it could only empty the list.

The row's star is the **same favourite the rail and the switcher show**, from
the same store and with the same strings — one mark on one project, not a
list-local flag, so starring it here stars it everywhere. Favourites sort to
the top of the list before it is sliced, which is what keeps a project someone
cares about reachable on the front door after it has aged out of the newest
few. Like the switcher's star it is rendered at rest rather than on hover: a
marked favourite has to be readable without pointing at it, and a hover-only
control cannot be reached by keyboard at all.

**With a project open, Overview is the Journey page** (§ Layout concept,
Primary workspace): it answers one question — where is my work on the way
from an edited file to a published version — and then shows the two lists
that question is about. It is a page, not a stack of cards. The
header sits on the workspace like a Linear or Vercel project page: the
project's own icon (the rail's identity chip, which opens its icon picker),
name, path with the detected technology beside it, the line selector (a
labelled fact, borderless at rest) and its settings. Under it, one card holds the band: three
tiles — Changes, Save, Publish — joined by connectors that turn solid as each
step is reached. The band is the app's model of Git drawn once rather than
explained. All three tiles are buttons in their entirety that lead to the
screen owning them (Changes, History, the remote check, project settings when
there is no remote); the tile whose action is the one thing to do now is
ringed in the accent and *is* the action: its value is the verb ("Save
version"), its hint the reason ("Keep your work safe"), and its own glyph
circle is filled solid in the accent — the primary button's colour — and
breathes: a slow, soft halo, the one moving thing on the screen, marking the
one thing to do. The three fills a glyph circle can take are the band's whole
hierarchy: neutral is a fact, light is done, solid is do this. There is no
separate primary button: a button inside one tile is a thing its neighbours
would never match, and a button under the band said the tile twice. Every
state the old status cards described in prose is a state of one of the three
tiles instead — loading, failed, conflicts (which take the first tile, in
warning, and block the second), unsaved, saved, versions ready to publish,
newer versions available, diverged, no remote — and one sentence under the
band says what the active tile means, with when the remote was last checked
and the one remote refresh at its end. The current tile takes the band's wide
column; with nothing waiting the three are equal. Facts are not repeated
across tiles: with everything saved, Changes says what will appear there and
Save says when the last version was saved.
It is a stepper in the shape of Headspace's or Fitness's home, not a wizard:
nothing is gated, and a reader who already knows Git reads it as a status row.
The last row pairs Changed files (one column of rows in the Changes screen's
own shape, sampled one category at a time so "7 edited, 1 new" shows the new
one, with the same "View all" in the same corner handing off) with Recent
history, at one height while there are files to list; with none, the files
card shrinks to its tick and one tip and History takes the width it leaves. The two cards share one header shape — a neutral
40px glyph tile, a title, one line, the trailing action — and every glyph tile
on the screen is that same filled circle, no rings and no borders; the band's
connectors draw themselves when a step is reached, a one-beat transition and
never a loop. Versions
saved but not yet published are rows of that history, marked and offering
"Publish up to here" under the pointer, rather than a card of their own. Nothing
counts anything twice: the band's Publish tile is the one place "N ready to
publish" is said, and there is no green number beside the line name. Every
glyph tile on the screen is a circle, per Shape, including the ones a mockup
would draw as rounded squares.

**Changes saves from one place, and it is the place the files are.** The
screen used to offer a version twice: a primary "Save version" in the
heading that opened the dialog, and the quick box docked under the file list
that saved on its own. Both were the same form — name, details, "also
publish", the hooks escape — differing only in that the dialog stated its
plan and the box did not; opened together they put two accent-filled buttons
on one screen, which is the thing the Journey page's band was built to stop
("a button under the band said the tile twice"). Now the box is the one save
control on the screen and the heading carries only the title and the state.
**The box is a composer docked under the list, not a card that grows out of
a field.** It is a section of the list panel — a hairline over it, the
panel's own background — the way GitHub Desktop and Fork dock their commit
box. At rest it is one row: the name field, a pill like every single-line
input, and the Save button beside it, so the one thing to do is visible
without a click and nothing decorative stands in for it. An earlier version
led the field with the Overview band's solid, breathing glyph circle; it
looked like a button and was not one, so it is gone, and the breathing halo
stays the band's. Focus opens the box upward without changing its shape:
the plan over the field — `3 of 7 files → main`, the count first and the
line in the status bar's own mono, since the panel header is the tab pair
and names no line — then the details, only the notes the plan line cannot
say (a first version, changes already prepared, no line to land on; files
left behind are the line's to count), any failure, and a foot with "Also
publish" and the button. The plan is Rust's answer and lands a beat after
the box opens, so its line is held open at its height from the first frame
and the text arrives with the list's own row entrance (`.row-in`) rather
than snapping on. The details are a textarea at `--radius-control` that
grows with what is written, to about eight lines, and then scrolls: room for
a long message without a second, bigger frame to write it in. The two
placeholders are a pair of questions — "What changed?" over "Why?
(optional)" — so the name says what changed and the details say what the
name cannot, and "what changed" rather than "what did you change", because
the change may be an AI's or a teammate's. "Also publish"
is a checkbox, because it is an option of this save and not a setting that
takes effect on its own, and the button says the consequence: "Save", or
"Save and publish" — at the list's width the longer label takes a line of
its own under the option rather than clipping either. While saving it says
only "Saving…" beside its spinner, at a button icon's size, so the row keeps
its height and its line. A failure prints the localized message and, under
it, what Git said behind the same "Show technical details" toggle the dialog
uses — open from the start when a hook rejected the version, since the
hook's output is the only thing that says what to fix — then the one-time
hooks escape. Saved, the plan's slot says what was saved in one line, with a
check in the success colour, and "Publish now" takes the place of "Also
publish" at the start of the foot: a secondary button level with Save, the
step left to do for a version whose option is spent, and not a second
primary, since the band's Publish tile says that step in full. It is absent
when "Also publish" already took the reader there, and the next keystroke
brings the option back.

**The box folds only when leaving it loses nothing, and never under the
pointer.** It closes when focus leaves it with nothing written and nothing
in flight; a draft or a save keeps it open, and Escape clears the draft and
folds it on purpose. Pressing inside the box on something that takes no
focus — the option's words, a disabled Save, the plan line — is not
leaving. Neither is the window losing focus: minimized or behind another
app, the page keeps its focus on the field and hands it back on return, so
the box stays as it was rather than folding and springing open again. A
press somewhere else — a file row, the History tab, the diff — lets its
click land first and folds after, without the scroll anchoring an open
gets: folding between the press and its release moved the list under the
pointer, and the release landed on another row or on none. A keyboard move
away folds at once, since there is no click to protect. The rule is one hook,
`useDockedComposerFocus`, shared with the new-line box on Lines, and the
layout is one primitive, `.docked-composer` in primitives.css, so the two
docked boxes cannot drift apart. A request in flight disables the fields,
which drops focus to the page; when it ends, focus goes back to the field
unless the reader has put it somewhere else, so the box can still fold
when they leave it.

The flow underneath is one implementation (`useSaveVersionFlow`) in two
frames: the box here, the modal dialog on the screens with nowhere to type —
Overview's active tile, saving before switching a line — and the notes and
the failure detail come from one place so the two cannot explain a plan or a
failure differently. The box offers no way into the dialog: it would be the
same form in a bigger frame, over the list whose checkboxes stay live while
the box is open, and a second route to one form is what this screen stopped
doing. One accent fill in every state of the box: the button. **The panel is
the card.** The screen's name and its
state used to be a page row over both panels — the Linear-style header a
workbench does not have (GitHub Desktop, Fork, Tower and VS Code all start
their panels at the toolbar), with a trailing corner waiting for view
controls that live in the panels. A miniature of the Overview band was tried
there and read as decoration: the rail already says where you are, the
status bar what is unsaved, and three grey dots that do nothing answer a
question nobody asks on this screen. So the list panel's own header is the
row, at the height of a strip (`--strip-height`), because the diff panel
beside it keeps its one strip — the file's icon, its name, its folder, its
category, the reading controls — and the two must start on the same pixel
row. Both are fixed: a header that grew with what it said would be a strip
that never stayed level. **The header is the Work screen's tab pair**
(task 126): two equal halves, Changes and History, the way GitHub Desktop
heads its sidebar. Each tab is its glyph — the one it carried in the rail
while it was a screen — and its word, set in the title's own type (size,
weight and tracking), so switching moves nothing; only the colour changes:
the active word goes primary, its glyph takes the accent, and a 2px rule in
the accent sits on the header's bottom edge under it. It is the rail's active
colour, not the band's "do this" fill: a tab is where you are, not what to
do. The Changes tab carries no count, because the status
bar and the band already say it and nothing is counted twice. The tab pair is
drawn in every state the panel has — loading, nothing to review, listing —
because it is also the way to the other tab; and it stays put while a tab's
chunk loads, in a loading shell of the same column. The search strip under
the header steps down to `--strip-height-inner`, the way History's inner
panes step down from their panel; the diff needs no second strip and starts
its code under its header. The **include-everything checkbox heads the
search strip**, at the rows' own inset, so it reads as the column's head
(GitHub Desktop heads its list the same way) and the search box takes the
rest of the strip — the shape History's strip has — with the
discard/restore `⋯` at its end: it acts on the list it heads, and it stays
out of the save box, so the destructive menu never lives inside the primary
control. It drops down and across the diff so what is about to be discarded
stays in view. The breakdown and the line totals the header used to
carry beside it are gone: a row of counts between the strip and the files
took a file's height to say what the Journey band and the status bar already
say, and a partial selection is the checkbox's own mixed state and the save
box's plan ("3 of 7 files → main"). Nothing is counted twice. With nothing to
review the list panel keeps its tabs and says "Everything is saved" in a
state row at the inner strip's height, and the empty block — glyph,
headline, the way back to Overview — sits in the diff panel, where the
reading surface would be; in a one-column window the two stack. **History
follows the same shape.** Its timeline panel wears the same tab pair as its
header; its search strip steps down to `--strip-height-inner`; and the scope
— which history is being read, removable where it is stated — is a chip in a
state row under the search strip, drawn only while the timeline is not the
current line's, so the common case keeps its rows one strip down. It stays out of the
filter chips because it is not a filter: clearing the filters must not change
the line. Loading, failed and "no saved versions yet" keep the timeline panel
and its tabs, with the state block in the detail panel. The
card is a single surface: the version strip carries the subject and its facts
(author, time, short commit, publication, file count) at `--strip-height`; its
trailing `Details` opens the story (the full message, what the diff is compared
against, and the commit's facts) without displacing the diff; and `⋮ More`
carries the version's actions. There are no tabs: the file list and the diff
are always the working surface, and the reading controls — the two step pairs,
a find that expands from its icon, and the view picker — live in one toolbar
across the whole card, over both panes, with the file search stepped down into
its own pane so that toolbar keeps a whole row's width at any window size.
Renaming and deleting a line stay on the Lines screen rather than being
duplicated in every menu. The version strip is a fixed `--strip-height`,
not a minimum: the timeline panel's header beside it is exactly that, and a
strip that grew with its two lines sat its rule ~20px below the tabs'. It
carries no avatar — a 24px circle beside the name it abbreviated said who
saved it twice. Its second line is the author in full, the reference that
points here, and, for a version that has not left the machine, the timeline
row's laptop glyph with its tooltip. Published draws nothing, as on the row,
and neither does an unknown answer, because a strip must not say "no idea";
`Details` states both in words. The
open file's category in
the diff header is the same glyph with the word beside it rather than a
pill: a third shape for one fact the row and the band already draw alike.
The diff strip also carries History's find — one shared control — so a search
inside the open difference is the same gesture, in the same place, on either
tab. Which tab is showing is the project's to remember, like its selected
file: Back and Forward move between screens, as they do in GitHub Desktop,
and a project left on History comes back to History. A hand-off from another
screen — the band's tiles, "view on History" from Lines, the palette's "Go to
Changes" and "Go to History" — opens Work on that tab.
The "everything is saved" state's circle is the band's done tile, light fill
and no shadow, since nothing there rests on anything. A checked checkbox —
the app's one definition, `.app-checkbox` — is that same light fill with the
tick in the accent, everywhere it appears: a file included in the next
version is a decision made, and a column of solid accent circles beside the
list competed with the one control on the screen that asks to be pressed.
Solid is reserved for "do this". **A row that arrives while the screen is
open animates; the list the screen opens with does not.** Work is a surface
you act on, so it is readable the instant it appears — nothing assembles
itself — and `.row-in` is kept for the work that genuinely shows up: a file
the watcher just noticed, a version just saved. `useRowArrival`
(rowArrival.ts, shared by Changes and History) decides that, and the two tabs
answer it the same way: any file added to the Changes list, and only a commit
prepended at the head of History's timeline, so loading an older page is not
mistaken for new work. Up to three arrivals cascade, 40ms apart, so a late
arrival never waits on a position that has nothing to do with it, and a
virtualized row is still never animated by a scroll that mounted it. Overview
keeps the entrance stagger on its sampled lists.

**Dropping a folder on the window** opens it. While a drag is over the window
— and only then — a window-sized overlay names what a drop will do. It is
feedback about a gesture, not chrome: it never takes the pointer (an overlay
that swallowed the pointer would cancel the drop it invites), it stays out of
the accessibility tree because a drag has no keyboard equivalent to narrate,
and it does not appear under a blocking dialog, which is exactly when a drop is
ignored. Its dashed edge is the only dashed border in the app and is meant to
stay that way: dashes are the universal "drop here" mark, and a solid edge at
that size would read as a dialog.

**About separates what a maintainer needs from what the product is proud of.** Technical details answer "why is it broken on *your* machine": the platform, its build, the webview, the Git it found — all things that differ per install, and all things the copy button puts on the clipboard. Built with answers "what is this made of": Tauri, React, Rust, which are identical for every user of a given build and therefore explain nothing about a bug. Mixing the two produces a diagnostics block nobody can act on and a credits list nobody reads, so they are separate sections in separate shapes — label-and-value rows for the facts that vary, and a left-aligned inline line of mark, name and number, all three together, for the ones that do not. The credits were capsules first, then bordered tiles (a mark above a name above a version), and then rows that pushed each version to the right edge; the first two gave a fact nobody reads down a surface of its own, and the third tore the number away from its name. The inline lockup keeps them together; the heading stays on the section's left edge with "Your system" above it, and the row centres as a set under it, so a short row reads as one balanced line instead of clustering against the edge. Three credits fit one line without shrinking type or tearing a version away from its name, which is why the fourth (the build tool's own language) was dropped. Each credit is also a control that opens that project's own home page in the user's browser, because "built with Tauri" is a claim the reader should be able to check; it is a button rather than a link, since the destination is outside the app and an `href` would let a middle click navigate the webview the dialog sits in. A credit is not a call to action, so it stays at rest until pointed at and withholds nothing at rest — mark, name and version are all readable without hovering. On hover the name takes the accent and the one fact the resting credit cannot state appears: a small outward arrow, saying the press leaves the app. Its accessible name pairs the layer with the host it opens, so that fact reaches a screen reader before the press rather than after it, and every host is listed explicitly in the opener scope — an unlisted one simply fails to open. A value the app cannot establish is omitted, never filled with "unknown": a missing row says nothing, and a fabricated one sends a bug report the wrong way.

**About names the product together with its promise.** The mascot leads at hero scale, then the correctly cased `GitOdile` name, then the localized promise. The name takes `--text-hero` and the promise `--text-title`, so the hierarchy comes from the scale rather than from three unrelated sizes, and the decorative mascot is hidden from assistive technology. The `h2` still carries the name and the promise, so the dialog's accessible name identifies the app before stating its promise; the close control sits in the dialog's own corner above the hero rather than inline with the identity. The flask glyph after a preview version is the same `.channel-glyph` the status bar, the changelog and the update dialog use; those surfaces exist to describe one build identically, and hand-written channel pills had already drifted between them. Machine-specific rows sit under `Your system` / `Tu sistema`, not `Technical details`: platform, OS build, WebView and Git describe the reader's environment rather than an internal implementation. The copy control heads that section rather than trailing it — the label and the way to put it on the clipboard are one thing, and a full-width button below the list spent a row of height restating the same idea. It is a text action with a short visible label ("Copy"), because the section heading already names what is being copied, while its accessible name stays the full "Copy system info".

Licence and source links close the dialog after the credits. They are durable project provenance, not part of the product pitch or machine diagnostics, so placing them beneath both keeps the introduction focused and makes the bottom edge the predictable place for legal information.

**A dialog that carries a message is not the About dialog.** About is the
product-identity surface — the mascot at hero scale, a 28px name, 30px of
padding — and for a while the open-failure alert and the close-project
confirmation borrowed its shell, which is why a two-line sentence arrived under
a heading sized for a logo. (The changelog and the shortcut sheet still extend
About's shell on purpose: they are documents to read, not messages to answer.)
Short message dialogs use the same shell as every other dialog in the app
(§ Dialogs, size `s`). Two rules go with them. An error carries a circular
`--status-danger` glyph beside its heading, because a failure should be
recognizable before the sentence is read. And **the constructive choice is the
primary button** — "Turn into a project", not "Close": spending the brand green
on dismissing a problem tells the user the way out is the way back. When the
message names two ways out ("You can turn it into a project or choose
another"), the dialog offers both, and the other way out takes the dismiss
slot. Dismiss reads first, constructive last, the order every other dialog
uses.
