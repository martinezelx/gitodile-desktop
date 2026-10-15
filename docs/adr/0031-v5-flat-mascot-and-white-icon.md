# ADR 0031: Adopt the flat v5 mascot and an application icon on a white tile

- Status: accepted
- Date: 2026-10-14
- Replaces: the drawing, crops and icon of
  [ADR 0018](0018-v4-mascot-and-one-amber-application-icon.md) and the tile of
  [ADR 0029](0029-slate-icon-tile.md)

## Context

The v4 mascot was an outlined illustration: a lime crocodile with an ink
outline, wayfarer sunglasses with glints, a commit-graph crest with amber
HEAD and white commits, amber belly plates and four colours besides the body.
It carried a lot of character at hero size, but at 16–32px the glasses, the
crest's graph and the plates turned into noise, the outline thickened every
edge, and the icon needed a slate tile to keep the lime from reading as a
toy.

The v5 exploration (October 2026) redrew it as a flat silhouette: one solid
body with the belly, toes and pill-shaped eyes cut out of it, no outline and
no glasses. Its revisions straightened the snout, matched the teeth
and the fingers to one pointed shape, gave every corner a radius from one
small scale, cut the crest to five equal lobes on the v5 outline, thickened
the belly's plates and its edge line, and lined the plates up on one start.
An outline and several kinds of sunglasses were tried on it and set aside:
the outline vanished on dark surfaces and blurred the small sizes, and the
mark reads without the glasses.

## Decision

1. **The v5 silhouette is the mascot.** `scripts/icons/mascot-shapes.mjs`
   holds its traced shapes: the body's outline, the belly with its plates,
   the four toes and the two eyes. The body is lime `#86b640` with white
   belly, toes and eyes; in the app the body follows the theme (ADR 0013) and
   the belly, toes and eyes are holes that show the surface behind it.
2. **One drawing; the head is a crop of it.** Where only a head fits, the
   body is cropped from the crest to the snout tip and cut a little under the
   teeth, so the neck runs on below the edge. A separate closed head shape was
   tried and dropped: two drawings of one character drift apart.
3. **One application icon: the whole mascot on a white tile.** The body in
   ink `#0e1512` with warm white belly, toes and eyes `#fbf8f0`, on a rounded
   white tile lit from above, `#ffffff` at the top to `#e8e8e8` at the bottom,
   the same at every size and on every platform (macOS on Apple's 824px grid).
   This is the register of the white-tiled tools people keep beside it in the
   Dock (Slack, Chrome, Teams), and it follows Apple's advice to give a light
   icon a soft light-to-dark gradient rather than flat white: the grey base
   keeps the tile's edge visible on a white desktop. It is drawn large (0.8 tile
   pixels per drawing unit), its height centred in the tile and the snout tip
   4% short of the right edge, so the tail runs into the rounded corner and is
   cut there. That keeps the face legible at 32px while the icon still shows
   a whole, seated character rather than a floating head.
4. **The whole body inside the app.** Home and About show the full mascot.
   Home plays the one-time entrance (every edge traces, then the colours fill
   in) and then blinks both eyes now and then, at an uneven pace. About's
   front eye winks in step with the light that crosses the wordmark. The
   crest's commit wave and the lens sweep are gone with the crest graph and
   the glasses.
5. **The installer wears the icon's white.** The side panel shows the whole
   body and the header strip the head, both in the icon's ink. The head is
   also the in-app mark wherever only a head fits.
6. **The console's ASCII art is sampled from the v5 body**, as before, in
   one tone: the body dense, its white parts as holes.

## Consequences

- The icon reads as the same character at every size, on light and dark
  desktops alike: the ink mascot on white has the most contrast of every tile
  tried, and the slate's problem of fading into a dark taskbar is gone. At
  16px it is a dark silhouette with a light belly.
- The brand green no longer appears in the icon; it stays in the app, where
  the mascot's body is lime in the GitOdile themes.
- The in-app mark loses its outline, so on very light themes the body's
  lifted accent alone separates it from the surface. It is decorative and
  always sits beside text that names the screen.
- The commit-graph crest, which said what GitOdile does, is no longer in the
  mark; the product's history metaphor lives in the interface instead.
- `mascot.mjs` is smaller: one drawing from traced shapes, cropped two ways,
  instead of a layered tree, and the console art has one tone instead of five.
- The in-app eyes are cut by an SVG mask whose paths the wink and blink scale.
  Chromium (WebView2) repaints it as expected; if a WebKit webview did not
  repaint an animated mask, the eyes would simply stay open.

## Alternatives considered

- **Keep v4 and simplify only the small icon sizes.** ADR 0018 already
  rejected two drawings; the noise came from the drawing itself.
- **The head alone as the icon.** Tried first: legible at 16px, but a wide
  head in a square tile left empty space above and below it and read as a
  floating head rather than the character.
- **The whole body small, with air around it.** The face shrank to a few
  pixels at 16–32px.
- **Crops that cut the body** (just above the feet, under the belly, a bust).
  More face, but the closer crops cut the crest and turned it into a heavy
  block at the left edge; the centred whole body read best.
- **An ink outline on the v5 silhouette.** Lost on dark surfaces and
  thickened every small size.
- **Sunglasses on the v5 silhouette** (the v4 pair adapted, a visor, pixel,
  round, aviator and plain frames). Each worked at hero size; none was needed
  for recognition, and they hid the eyes the wink uses.
- **A lime tile** (`#a6d05a` to `#6f9a2e`), the first choice: it carried the
  brand green, but next to other tools it read louder and less like a
  professional tool than white.
- **Flat whites and off-whites** (pure, warm, bone, cream, cool, pearl and
  mist): the flat tiles vanished on a white desktop and looked like a cut-out
  sticker; the gradient keeps the tile a shape.
- **Other white gradients** (neutral, cool and warm, softer and stronger): the
  softest read as flat, the strongest as grey; the cool and warm ones moved
  away from a neutral system look.
- **Other tiles:** anthracite with a lime or honey mascot, honey with ink,
  teal, mint and ink tiles were compared on light and dark desktops.
