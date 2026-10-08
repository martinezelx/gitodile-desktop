# ADR 0029: Put the application icon on a slate tile

- Status: accepted
- Date: 2026-10-08
- Replaces: the tile colour in decision 2 of
  [ADR 0018](0018-v4-mascot-and-one-amber-application-icon.md)

## Context

ADR 0018 set the application icon on a rounded amber tile lit from above,
`#fbe3a0` to `#e0a032`. Seen in the Dock, the taskbar and the installer next
to other developer tools, the warm honey gradient made the icon read as a
game or a children's app rather than a tool for professional work, which
works against the "professional friendliness" the brand aims for.

## Decision

1. The tile is slate lit from above, `#2c3542` at the top to `#161b22` at the
   bottom. Everything else about the icon from ADR 0018 stands: one portrait
   crop, one icon on every platform and at every size, the same margins.
2. The mascot keeps all its colours: the lime body `#86b640`, the deep teal
   crest, the amber `#e7b448` HEAD, graph line and belly plates, and the white
   commits. Amber stays the mark's highlight; it is no longer also the tile.
3. The in-app mark, the console art and the brand PNGs of the mascot are
   unchanged, because only the tile changes.
4. The Windows installer's bitmaps use the same slate: the whole mascot on
   the side panel and its head on the header strip.

## Consequences

- The icon reads as a developer tool and the lime and amber stand out more
  against a dark tile than against a warm one.
- On a dark taskbar or Dock the tile's edge is softer than the amber one was;
  the lime silhouette and the sunglasses carry recognition there, as they
  already did at 16–32px.
- The Windows installer takes the slate too: its side panel is the whole
  mascot on slate and its header the mascot's head on slate, both drawn from
  the one mascot in `mascot.mjs` instead of pasting the icon on white. They
  carry no text, so they need no translation.
- `tauri icon` 2.12 writes ICO layers smallest first, so
  `build-windows-ico.mjs` now sets Tauri's documented order (32px first)
  instead of inheriting it.

## Alternatives considered

- **Graphite tile with an orange accent** (`#171c22`, `#f97316` for HEAD, line
  and plates). Close to this decision, but it changes the mascot's accent in
  every surface, not only the icon, and the comparison put the orange crest
  commits at odds with the white-commits-on-amber-line graph.
- **Navy tile with a "Git" green body** (`#1f2937`, `#3cb371`). The mint body
  lost the character's identity and contrasted less on the dark tile.
- **Deep petrol tile** (`#124a43` to `#06201d`). Coherent with the crest, but
  the crest's teal blended into the tile.
- **Cool light-grey tile.** Clearer on dark desktops, but close to the
  generic white tiles of many apps and less "tool" than the slate.
- **Keep amber.** Rejected for the reason in the context.
