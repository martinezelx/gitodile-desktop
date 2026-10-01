# ADR 0018: Adopt the v4 mascot and one amber application icon

- Status: accepted
- Date: 2026-09-30

## Context

The v3 mark was a lime crocodile in profile with black sunglasses, drawn in two
variants: the full body for icons from 48px up and a head for smaller ones.
Packaged icons were the transparent mascot on Windows and Linux and the same
mascot on an emerald tile on macOS. The mark read well at 16px, but the
character had little personality beyond the glasses, and a lime crocodile in
profile is a common image.

The v4 exploration (September 2026) redrew the mascot as a character first and
a mark second: a seated crocodile with a long snout, a rounded crest, a white
belly and short arms, then iterated on what made it feel childish (large eyes,
a heavy outline, saturated colour, a short snout) and on what could make it
specifically GitOdile. The result keeps the v3 sunglasses, so the new mark is
recognisably the same brand, and adds two details that describe the product:
a crest drawn as a commit graph (an amber HEAD node at the neck, white commits
along an amber line) and amber belly plates.

Three questions came with it: how the icon should crop a character that is
nearly square rather than 2:1, whether the platforms should keep different
icons, and whether small sizes need their own drawing.

## Decision

1. **One drawing.** `scripts/icons/mascot.mjs` holds the v4 mascot as a single
   element tree (outline, crest with its graph, body, teeth, belly and plates,
   limbs, sunglasses). Every surface is a crop of it: `body` (the whole
   character) for the welcome screen, About, the console welcome's ASCII art
   and brand material; `head` for a brand asset; `portrait` for the icon.
2. **One application icon.** Every platform and every size uses the same icon:
   the portrait (crest to snout tip across, the body running off the bottom
   edge) on a rounded amber tile lit from above, `#fbe3a0` to `#e0a032`.
   Windows and Linux take it filling the canvas; macOS takes the identical icon
   on Apple's 824px grid so the Dock can draw its shadow. There is no head
   variant and no transparent icon any more.
3. **No separate small drawing.** The 16–32px sizes are the same portrait,
   downsampled. The sunglasses carry recognition at those sizes; a simplified
   drawing was tried and rejected so the icon stays one image.
4. **In-app mark.** The body's green follows the theme as before (ADR 0013);
   the outline, crest, sunglasses, teeth and amber details keep their colours.
   The GitOdile themes use the brand green `#86b640`.
5. **Brand assets.** `pnpm icons` also writes the icon at every shipped size,
   the macOS icon and the mascot and head as PNGs under `src/assets/brand/png`,
   next to the generated SVGs, so the brand files are at hand outside the
   build.

## Consequences

- The icon is legible and consistent across the Dock, the taskbar, Start, the
  installer and the stores, and the pipeline renders one source instead of
  four and no longer splices head layers into the ICO and ICNS.
- At 16px the crest's commits and the belly plates blur into a few pixels;
  the silhouette, the amber tile and the black band of the sunglasses remain.
  If that proves too noisy in practice, a simplified small drawing is the
  documented fallback, kept in the same crop.
- The in-app mark is taller relative to its width (1215×1095 instead of
  1400×700), so the welcome mascot is set at 144px wide instead of 168px.
- The console prints the whole mascot as ASCII art (`ascii-art.mjs`), shaded by
  how much ink each character cell holds, with its outline widened
  (`strokeScale`) because at one character per cell the v4 outline is thinner
  than a cell. A grid of square pixels was tried first and read as a blocky
  silhouette rather than the character.
- The Windows installer's side panel shows the tiled icon on warm white instead
  of the mascot on emerald.

## Alternatives considered

- **Keep the v3 mark.** Recognisable at every size, but the brand needed more
  character than the glasses alone gave it.
- **Full body at every size.** Charming at 256px, but the character fills
  little of the tile and is unreadable below 48px.
- **Head only.** The most legible crop at 16–32px, but it loses the crest and
  belly that make the v4 character distinctive, and a head cut at the neck
  looks cropped in large sizes.
- **Portrait from 48px up and head below it**, as v3 split body and head.
  Rejected to keep one image everywhere.
- **Different tiles per platform** (transparent on Windows and Linux, tiled on
  macOS). Rejected: one tile makes the icon one object on every desktop.
- **Other tile colours**: emerald, anthracite, ink green, forest green, night
  blue, cream, white, and several ambers were compared on light and dark
  desktops. Amber lit from above was chosen: it turns the mascot's accent into
  the brand colour and stands out on both desktops.
