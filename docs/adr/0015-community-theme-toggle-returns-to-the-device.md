# ADR 0015: A community theme's toggle returns to the device

- Status: accepted
- Date: 2026-09-21
- Amends: ADR 0012, whose resolution model described the titlebar toggle as a
  cycle over the official trio only.
- Supersedes: ADR 0014 (the toggle remembered the last light and dark theme).

## Context

ADR 0014 made the titlebar toggle return to the theme last used in the other
scheme, so a pinned community theme would not be abandoned. The owner tried it
and found it less predictable than expected: remembering a hidden pair adds
state a user cannot see, and it never offered a direct way back to "match
device". The owner prefers a simpler rule.

## Decision

- When the active preference is a **community theme**, the titlebar toggle
  switches to **`"system"`** ("match device"), handing control back to the
  device. Its glyph becomes the monitor, the same one the picker uses for
  "Match device", and its accessible name is the existing "Use system theme"
  string.
- From **`"system"` or an official theme**, the toggle flips between the two
  official themes: it resolves the current scheme and switches to the official
  theme of the other scheme (sun when the next is light, moon when the next is
  dark).
- No per-scheme theme memory is kept; `gitodile-theme-recent` and
  `useRecentThemes` are removed.
- "Match device" and every named theme stay reachable from Settings >
  Interface > Theme and the command palette; the toggle is a fast path, not the
  only path.

## Consequences

- The toggle is predictable and stateless: community → device → official
  light/dark, with the glyph always describing the next press.
- Pressing the toggle from an official theme does not return to `"system"`;
  that is an explicit choice in Settings or the palette. This matches the
  owner's stated preference.
- The two dark-only community palettes (Nord, Tokyo Night, Dracula) and the
  paired ones (Catppuccin) behave identically, which the memory approach did
  not guarantee as cleanly.
- No extra preferences are stored, so `preferences.ts` loses the recent-theme
  reader and hook.

## Alternatives considered

- **Remember the last light and dark theme (ADR 0014).** Rejected after use:
  hidden state, and no direct route back to the device.
- **Pair each theme with a family counterpart.** Inconsistent for the dark-only
  palettes and still needs a fallback.
- **Official-only three-state cycle (`system` → light → dark).** Does not give
  a community theme a one-press route to the device, which is the behaviour the
  owner asked for.
- **Disable the toggle for community themes.** Loses the fast path entirely.
