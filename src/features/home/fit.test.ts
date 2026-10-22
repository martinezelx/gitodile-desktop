import { describe, expect, it } from "vitest";
import { HOME_SCALE, homeScale, homeTop } from "./fit";

describe("homeScale", () => {
  it("is 1 for the area the launcher is drawn for", () => {
    expect(homeScale(HOME_SCALE.width, HOME_SCALE.height)).toBe(1);
  });

  it("follows the tighter of width and height", () => {
    // A wide, short window: the height decides.
    expect(homeScale(1856, 960)).toBe(1.2);
    // A narrow, tall one: the width decides.
    expect(homeScale(1488, 1200)).toBe(1.2);
  });

  it("stays between the minimum and the maximum", () => {
    expect(homeScale(700, 500)).toBe(HOME_SCALE.min);
    expect(homeScale(3800, 2100)).toBe(HOME_SCALE.max);
  });

  it("rounds to a hundredth", () => {
    expect(homeScale(1388, 838)).toBe(1.05);
  });

  it("is 1 while the area is unknown", () => {
    expect(homeScale(0, 900)).toBe(1);
    expect(homeScale(1200, 0)).toBe(1);
    expect(homeScale(Number.NaN, 900)).toBe(1);
  });
});

describe("homeTop", () => {
  it("puts two fifths of the free height above the launcher", () => {
    expect(homeTop(900, 600, 1)).toBe(120);
    expect(homeTop(900, 500, 1.2)).toBe(120);
  });

  it("never goes negative when the launcher is taller than the area", () => {
    expect(homeTop(600, 700, 1)).toBe(0);
  });
});
