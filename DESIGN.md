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

1. **Top bar** — implemented as a custom titlebar with three zones (left/center/right), not a traditional File/Edit/View menu bar, which reads as legacy Win32/desktop-app chrome:
   - left: brand, draggable;
   - center: a command-palette trigger (`Ctrl`/`Cmd`+`K`), the app's substitute for a menu bar — every action gets a command instead of a menu item;
   - right: window controls (minimize/maximize/close), styled as small rounded buttons inset from the edge rather than full-height square hit targets, so they read as part of the same rounded-corner system as the rest of the UI instead of bolted-on OS chrome.
   - The remaining left/right space stays a native drag region so the window is still movable/double-click-maximizable without a menu bar occupying it.

2. **Navigation rail or sidebar**
   - Overview;
   - Changes;
   - History;
   - Workspaces/branches;
   - Recovery;
   - optional advanced Git tools;
   - collapsible to an icon-only rail (persisted, and reachable from the command palette as "Collapse/Expand sidebar") for users working with a narrow window or wanting more room for diffs.

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
- `--accent-primary`
- `--accent-primary-contrast` (text/icon color placed on top of `--accent-primary`)
- `--status-success`
- `--status-warning`
- `--status-danger`
- `--diff-added`
- `--diff-removed`
- `--overlay` (modal/backdrop scrim)
- `--surface-hover` / `--surface-active` (neutral interactive-state tints, used for any hover/pressed/selected state instead of one-off `rgba(...)` values)
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` (elevation; theme-aware, see below)

Do not hard-code product colors throughout components.

### Elevation

Use shadows to signal stacking order, not to decorate: `--shadow-sm` for resting cards and controls, `--shadow-md` for content the user is meant to focus on (hero card, a lifted hover state), `--shadow-lg` for anything floating above the whole UI (dialogs, popovers). In dark mode shadows read as depth against the near-black background; in light mode they carry more of the separation work since borders alone are subtler there — both are defined per theme so neither look goes flat.

### Icons

Sidebar navigation and inline controls use [Lucide](https://lucide.dev) icons (`lucide-react`, ISC) at 16–18px, imported by name so unused icons are tree-shaken out of the bundle. Chosen over hand-drawing our own because it ships real Git-specific glyphs (`GitCompare`, `GitCommitHorizontal`) instead of the generic pencil/clock metaphors the app used before — see the icon-library comparison done when this was decided. An active nav item tints its icon with `--accent-primary`; the label stays `--text-primary`. Don't mix in a second icon library or hand-drawn icons alongside it — pick the closest Lucide glyph even when it's not a perfect semantic match.

Brand identity (mark + name) appears in exactly one visible place at a time, never two. The sidebar's brand block is the canonical one; the titlebar carries no branding of its own while the sidebar is visible, matching Arc/Notion/Linear-style custom titlebars — a second icon+name stacked a few pixels above the sidebar's reads as an accidental duplicate, not an intentional echo. The titlebar's brand block only reappears (icon and name together) once the sidebar is hidden below the 800px breakpoint, since it's then the sole remaining identity signal.

### Honest affordances

A control that does nothing yet must not look fully interactive. Navigation entries for screens that don't exist yet (e.g. Changes, History, Recovery before their flows are built) are rendered `disabled` with reduced opacity and a "Coming soon" tooltip, rather than looking clickable and silently failing. Replace the disabled state with a real view as soon as the screen exists — don't leave it disabled out of habit.

### Theming: light and dark

The brand accent is a green (`--accent-primary`), but the same hex value cannot serve both themes: a light, saturated green reads well on a near-black surface but fails WCAG AA contrast on a white one. Each theme gets its own value for every color token, tuned to the same hue family so the brand stays recognizable across themes.

| Token | Dark value | Light value |
|---|---|---|
| `--surface-app` | `#10160f` | `#f6f8f3` |
| `--surface-panel` | `#17201a` | `#ffffff` |
| `--surface-raised` | `#1c2620` | `#ffffff` |
| `--surface-code` | `#151d17` | `#eef2ea` |
| `--text-primary` | `#eef3ea` | `#16210f` |
| `--text-secondary` | `#a3ad9d` | `#5c6b53` |
| `--border-subtle` | `rgba(255, 255, 255, 0.08)` | `rgba(20, 30, 16, 0.1)` |
| `--accent-primary` | `#6fce7d` | `#2f8f4c` |
| `--accent-primary-contrast` | `#0d2110` | `#f2fff5` |
| `--status-success` | `#6fce7d` | `#2f8f4c` |
| `--status-warning` | `#e8b339` | `#8a5b00` |
| `--status-danger` | `#ff6b5b` | `#b3261e` |
| `--diff-added` | `#6fce7d` | `#2f8f4c` |
| `--diff-removed` | `#ff6b5b` | `#b3261e` |
| `--overlay` | `rgba(4, 8, 6, 0.68)` | `rgba(16, 22, 15, 0.4)` |
| `--surface-hover` | `rgba(255, 255, 255, 0.06)` | `rgba(20, 30, 16, 0.05)` |
| `--surface-active` | `rgba(111, 206, 125, 0.16)` | `rgba(47, 143, 76, 0.14)` |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.22)` | `0 2px 8px rgba(20,30,16,0.08)` |
| `--shadow-md` | `0 8px 20px rgba(0,0,0,0.3)` | `0 8px 20px rgba(20,30,16,0.1)` |
| `--shadow-lg` | `0 24px 80px rgba(0,0,0,0.45)` | `0 24px 60px rgba(20,30,16,0.16)` |

`--surface-active` is accent-tinted rather than neutral gray — this is what gives the active nav item and selected segmented-control option their "friendly card" warmth instead of a flat gray highlight.

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

**Placeholder mark:** until a custom mascot is designed, the app icon and every in-UI brand mark (sidebar, titlebar, About dialog) use a crocodile line-art glyph from [OpenMoji](https://openmoji.org) (CC BY-SA 4.0 — free for commercial use with attribution; source kept at `src-tauri/icons/source.svg`). It's a stand-in, not the final mascot: replace every instance of it together when the real one ships, don't let it linger in some spots after others move on.

## Typography

Use the system UI font stack initially for native feel and low bundle cost. A branded typeface can be evaluated later.

Requirements:

- clear distinction between headings, labels, body copy, and metadata;
- monospaced text for paths, refs, hashes, commands, and diffs;
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
