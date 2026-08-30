import { describe, expect, it } from "vitest";
import { avatarColorVar, avatarInitials, avatarPaletteIndex } from "./projectAvatar";

describe("avatarPaletteIndex", () => {
  it("is stable for the same id", () => {
    expect(avatarPaletteIndex("/repos/gitodrile")).toBe(avatarPaletteIndex("/repos/gitodrile"));
  });

  it("stays within the palette range", () => {
    for (const id of ["/a", "/repos/gitodrile", "C:\\work\\project-x", ""]) {
      const index = avatarPaletteIndex(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(8);
    }
  });

  it("usually differs for projects sharing only their first letter", () => {
    // Not a guaranteed property of any hash, but this is the whole point of
    // hashing the full canonical path rather than just the display name.
    expect(avatarPaletteIndex("/repos/project-alpha")).not.toBe(avatarPaletteIndex("/repos/project-apex"));
  });
});

describe("avatarColorVar", () => {
  it("references the palette variable matching the id's index", () => {
    const index = avatarPaletteIndex("/repos/gitodrile");
    expect(avatarColorVar("/repos/gitodrile")).toBe(`var(--avatar-color-${index})`);
  });
});

describe("avatarInitials", () => {
  it("uses the first letter of each of the first two words", () => {
    expect(avatarInitials("my app")).toBe("MA");
    expect(avatarInitials("my-app")).toBe("MA");
    expect(avatarInitials("my_app")).toBe("MA");
  });

  it("falls back to the first two characters of a single word", () => {
    expect(avatarInitials("gitodrile")).toBe("GI");
  });

  it("handles short and empty names without throwing", () => {
    expect(avatarInitials("x")).toBe("X");
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials("   ")).toBe("?");
  });
});
