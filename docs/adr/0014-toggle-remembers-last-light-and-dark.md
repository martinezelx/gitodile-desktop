# ADR 0014: The titlebar toggle remembers the last light and dark theme

- Status: superseded
- Date: 2026-09-21
- Superseded by: ADR 0015. The owner preferred a simpler rule after using it:
  a community theme's toggle returns to "match device" rather than to a
  remembered theme.

## Context

With only the official pair, the titlebar toggle could flip between
`gitodile-light` and `gitodile-dark` from the resolved scheme. Once community
themes exist, that flip silently abandons the user's choice: from Catppuccin
Mocha (dark) it jumped to GitOdile Light, so a quick brightness change threw
away the theme the user had picked. Options considered were a family pairing
(Latte↔Mocha), an official-only three-state cycle, a quick theme menu, and
hiding the toggle for community themes.

## Decision

- A small pair of preferences records the **theme last chosen in each scheme**
  (`light` and `dark` slots, defaulting to the official pair), stored under
  `gitodile-theme-recent`. An explicitly chosen theme is written to its
  scheme's slot; `"system"` is never remembered.
- The **titlebar toggle flips between the two slots**: it resolves the current
  scheme and switches to the theme last used in the other scheme. From
  Catppuccin Mocha it returns to the last light theme (Catppuccin Latte, or
  whichever the user used), and back.
- A slot whose stored value is unknown, or belongs to the wrong scheme, is
  discarded and falls back to the official theme for that scheme.
- `"match device"` and the official trio stay reachable from Settings >
  Interface > Theme and the command palette, so the toggle is a fast path, not
  the only path.
- The toggle glyph keeps reading the resolved scheme, so its sun/moon and its
  accessible name still describe the change it will make.

## Consequences

- A quick light/dark change never loses a pinned theme; the toggle is
  predictable for the community themes that have no official counterpart (Nord,
  Tokyo Night, Dracula) as well as those that do.
- Two small preferences are added; they are validated field by field like the
  diff and navigation snapshots, so a stale value degrades instead of breaking.
- The toggle is no longer a route to `"system"`; that is an explicit choice in
  Settings and the palette. DESIGN.md records this.
- The first toggle from `"system"` goes to an official theme, because the
  slots default to the official pair until the user chooses otherwise.

## Alternatives considered

- **Pair each theme with a family counterpart (Latte↔Mocha).** Nice where a
  light sibling exists, but Nord, Tokyo Night and Dracula have none, so the
  behaviour would be inconsistent and still fall back to an official theme.
- **Official-only three-state cycle (`system` → light → dark).** Simple and
  already documented, but it abandons the user's community theme.
- **A quick theme menu in the titlebar.** No hidden state, but it turns a
  one-click control into a popover and duplicates Settings.
- **Disable the toggle for community themes.** Honest but removes a fast path
  for exactly the people most likely to want one.
