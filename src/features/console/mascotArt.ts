import { MASCOT_PIXELS } from "./mascotPixels";

export { MASCOT_PIXELS };

export type MascotPixel = 1 | 2 | 3;
export type MascotRect = { x: number; y: number; width: number; pixel: MascotPixel };

/**
 * One rectangle per horizontal run of a colour. Drawn as vector cells the
 * way terminals render block glyphs themselves, so no font leaves seams
 * between columns, and the mark stays a hundred-odd shapes.
 */
export function mascotRects(pixels: readonly string[] = MASCOT_PIXELS): MascotRect[] {
  const rects: MascotRect[] = [];
  pixels.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const pixel = Number(row[x]);
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      if (pixel) rects.push({ x, y, width: end - x, pixel: pixel as MascotPixel });
      x = end;
    }
  });
  return rects;
}
