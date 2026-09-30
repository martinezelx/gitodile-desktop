import { describe, expect, it } from "vitest";
import { MASCOT_ASCII, MASCOT_ASCII_COVER, MASCOT_ASCII_TONES, mascotLines, mascotRain } from "./mascotArt";

describe("mascotLines", () => {
  it("keeps the art rectangular, printable and toned glyph for glyph", () => {
    expect(new Set(MASCOT_ASCII.map((line) => line.length)).size).toBe(1);
    expect(MASCOT_ASCII.join("")).toMatch(/^[ -~]+$/);
    expect(MASCOT_ASCII_TONES).toHaveLength(MASCOT_ASCII.length);
    expect(MASCOT_ASCII_COVER).toHaveLength(MASCOT_ASCII.length);
    MASCOT_ASCII_TONES.forEach((tones, y) => {
      expect(tones).toMatch(/^[0-5]+$/);
      expect([...tones].map((tone) => tone === "0")).toEqual([...MASCOT_ASCII[y]].map((glyph) => glyph === " "));
      expect(MASCOT_ASCII_COVER[y]).toMatch(new RegExp(`^[01]{${MASCOT_ASCII[y].length}}$`));
    });
  });

  it("splits each line into runs of one tone and cover that rebuild it", () => {
    expect(mascotLines(["  +@@ "], ["001220"], ["011110"])).toEqual([[
      { text: " ", tone: 0, solid: false },
      { text: " ", tone: 0, solid: true },
      { text: "+", tone: 1, solid: true },
      { text: "@@", tone: 2, solid: true },
      { text: " ", tone: 0, solid: false },
    ]]);
    expect(mascotLines().map((runs) => runs.map((run) => run.text).join(""))).toEqual([...MASCOT_ASCII]);
  });

  it("covers the white belly, which prints as spaces, so the rain passes behind it", () => {
    const holes = MASCOT_ASCII.flatMap((line, y) => [...line].filter((glyph, x) => glyph === " " && MASCOT_ASCII_COVER[y][x] === "1"));
    expect(holes.length).toBeGreaterThan(20);
  });
});

describe("mascotRain", () => {
  it("is seeded, stays inside the art and falls at a calm, varied pace", () => {
    const drops = mascotRain();
    expect(mascotRain()).toEqual(drops);
    expect(mascotRain(64, 1)).not.toEqual(drops);
    expect(drops.length).toBeGreaterThan(20);
    for (const drop of drops) {
      expect(drop.column).toBeGreaterThanOrEqual(0);
      expect(drop.column).toBeLessThan(MASCOT_ASCII[0].length);
      expect(drop.glyphs).toMatch(/^[0-9a-f]{5,13}$/);
      expect(drop.duration).toBeGreaterThanOrEqual(3.2);
      expect(drop.duration).toBeLessThanOrEqual(6.8);
      expect(drop.delay).toBeLessThanOrEqual(0);
      expect(-drop.delay).toBeLessThanOrEqual(drop.duration);
    }
    expect(new Set(drops.map((drop) => drop.column)).size).toBe(drops.length);
  });
});
