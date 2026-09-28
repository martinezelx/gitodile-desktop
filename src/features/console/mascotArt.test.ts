import { describe, expect, it } from "vitest";
import { MASCOT_PIXELS, mascotRects } from "./mascotArt";

describe("mascotRects", () => {
  it("keeps the pixel grid rectangular and within its palette", () => {
    expect(new Set(MASCOT_PIXELS.map((row) => row.length)).size).toBe(1);
    expect(MASCOT_PIXELS.join("")).toMatch(/^[0-3]+$/);
  });

  it("draws one rectangle per run of a colour and skips empty pixels", () => {
    expect(mascotRects(["0112", "2200"])).toEqual([
      { x: 1, y: 0, width: 2, pixel: 1 },
      { x: 3, y: 0, width: 1, pixel: 2 },
      { x: 0, y: 1, width: 2, pixel: 2 },
    ]);
    const painted = MASCOT_PIXELS.join("").replace(/0/g, "").length;
    expect(mascotRects().reduce((sum, rect) => sum + rect.width, 0)).toBe(painted);
  });
});
