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

- moderate rounded corners (14–18px on cards/panels, 8–10px on controls) — rounded enough to feel approachable, not so large it reads as a decorative concept app;
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
   - left: the command-palette trigger (`Ctrl`/`Cmd`+`K`) and a compact overflow menu. The palette is a labeled rounded control, making it the visual entry point for app-wide actions instead of another anonymous icon.
   - contextual history: Back/Forward stay together with the command controls. They remain visibly disabled until there is history to traverse, then become available without moving the surrounding chrome.
   - center: the remaining native drag region, including double-click maximize/restore.
   - right: window controls (minimize/maximize/close), styled as small rounded buttons inset from the edge rather than full-height square hit targets, so they read as part of the same rounded-corner system as the rest of the UI instead of bolted-on OS chrome.

2. **Navigation rail** — one 88px column, always the same width. By default,
   each destination is an icon in a 40px rounded square with its name
   underneath; the active state fills that square, never the whole cell, so a
   two-line label like "Líneas de versión" does not make its neighbour look
   shorter. Navigation Settings may switch to icons only: labels disappear and
   the vertical rhythm tightens, but the 40px pointer target and accessible
   name remain. This is a presentation mode, not a width-changing collapse, so
   projects and foot controls never jump sideways.
   - the brand mark has a clear 16px pause before Overview, so product identity
     and project navigation read as separate groups;
   - Overview, Changes, Version lines, History, and Recovery keep their order.
     Navigation Settings controls which stay in the rail; deselected and
     height-overflowed destinations remain reachable in More, in registry
     order. Recovery stays disabled and marked "Coming soon" until its screen
     exists;
   - "More" is always the final destination tile. As the window loses height,
     the trailing destinations move into its menu in order instead of making
     the narrow rail scroll. The menu always ends after a separator with
     "Customize navigation bar", which opens the dedicated Settings section;
   - below the destinations: the active project as a single square that opens
     a searchable switcher, plus a same-size "+" holding the three ways to add
     one (open, create, clone). A 24px interval, rather than a divider,
     distinguishes project context from navigation;
   - at the foot: Settings above the account button. These app-level utilities
     remain anchored and use the same footprint as the project controls.

3. **Primary workspace**
   - task-focused content;
   - clear empty states;
   - contextual primary action;
   - secondary technical details on demand.

4. **Optional inspector**
   - metadata;
   - exact Git details;
   - file or commit information.

The app should work well between approximately 1024px and large desktop displays. Do not assume a maximized window.

## Design tokens

```css
:root {
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;

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
- `--brand-mark-foreground` (theme-aware crocodile color used only inside the lime brand tile)
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
- `--focus-ring` (the visible keyboard focus color, distinct enough against every focusable surface)
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` (elevation; theme-aware, see below)

Do not hard-code product colors throughout components.

### Elevation

Use shadows to signal stacking order, not to decorate: `--shadow-sm` for resting cards and controls, `--shadow-md` for content the user is meant to focus on (hero card, a lifted hover state), `--shadow-lg` for anything floating above the whole UI (dialogs, popovers). In dark mode shadows read as depth against the near-black background; in light mode they carry more of the separation work since borders alone are subtler there — both are defined per theme so neither look goes flat.

### Icons

Sidebar navigation and inline controls use [Lucide](https://lucide.dev) icons (`lucide-react`, ISC) at 16–18px, imported by name so unused icons are tree-shaken out of the bundle. Chosen over hand-drawing our own because it ships real Git-specific glyphs (`GitCompare`, `GitCommitHorizontal`) instead of the generic pencil/clock metaphors the app used before — see the icon-library comparison done when this was decided. An active nav item tints its icon with `--accent-primary`; the label stays `--text-primary`. Don't mix in a second icon library or hand-drawn icons alongside it — pick the closest Lucide glyph even when it's not a perfect semantic match.

Brand identity (mark + name) appears in exactly one visible place at a time, never two. The sidebar's brand block is the canonical one; the titlebar carries no branding of its own while the sidebar is visible, matching Arc/Notion/Linear-style custom titlebars — a second icon+name stacked a few pixels above the sidebar's reads as an accidental duplicate, not an intentional echo. The titlebar's brand block only reappears (icon and name together) once the sidebar is hidden below the 800px breakpoint, since it's then the sole remaining identity signal.

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
| `--brand-mark-foreground` | `#14170f` | `#faf8f5` |
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
- Get team changes
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

Reuse one visual pattern for all of these across screens rather than each screen inventing its own: a centered block with a small icon in a bordered/shadowed square (`--radius-lg`), one short headline, one line of supporting copy, and 1–2 actions — see `.empty-state` in `styles.css`, first built for the "no project open" Overview state. A loading state is the same layout with a spinner/skeleton instead of the icon; an error state swaps in `--status-danger`. Do not build a bespoke illustration or a different card shape per screen — that's how a "no repository" panel and a "no results" panel end up looking like they belong to two different apps.
