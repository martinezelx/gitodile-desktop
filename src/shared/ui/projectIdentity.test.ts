import { describe, expect, it } from "vitest";
import {
  isTechnologyId,
  PROJECT_ICON_INITIALS,
  resolveProjectIdentity,
  sanitizeEmoji,
  TECHNOLOGY_IDS,
} from "./projectIdentity";

describe("resolveProjectIdentity", () => {
  it("prefers a chosen emoji over the detected technology", () => {
    expect(resolveProjectIdentity({ choice: "🐊", technology: "rust" })).toEqual({
      kind: "emoji",
      emoji: "🐊",
    });
  });

  it("uses the detected technology when no emoji is chosen", () => {
    expect(resolveProjectIdentity({ choice: null, technology: "nextjs" })).toEqual({
      kind: "technology",
      technology: "nextjs",
    });
  });

  it("falls back to initials when neither is available", () => {
    expect(resolveProjectIdentity({})).toEqual({ kind: "initials" });
    expect(resolveProjectIdentity({ choice: "   ", technology: null })).toEqual({ kind: "initials" });
  });

  it("ignores a stored value that is not a single short glyph", () => {
    expect(resolveProjectIdentity({ choice: "hello world", technology: "go" })).toEqual({
      kind: "technology",
      technology: "go",
    });
  });

  it("shows initials for a per-project initials choice, whatever the style", () => {
    expect(
      resolveProjectIdentity({
        choice: PROJECT_ICON_INITIALS,
        technology: "rust",
        style: "technology",
      }),
    ).toEqual({ kind: "initials" });
  });
});

describe("project avatar style", () => {
  it("defaults to the detected technology", () => {
    expect(resolveProjectIdentity({ technology: "go" })).toEqual({
      kind: "technology",
      technology: "go",
    });
  });

  it("shows initials for the initials style even when a technology was detected", () => {
    expect(resolveProjectIdentity({ technology: "react", style: "initials" })).toEqual({
      kind: "initials",
    });
  });

  it("shows a stable random emoji for the random style", () => {
    const first = resolveProjectIdentity({ id: "/repos/app", style: "random" });
    const second = resolveProjectIdentity({ id: "/repos/app", style: "random" });
    expect(first).toEqual(second);
    expect(first.kind).toBe("emoji");
  });

  it("keeps a chosen emoji above the style", () => {
    expect(
      resolveProjectIdentity({ choice: "🐊", technology: "rust", style: "initials" }),
    ).toEqual({ kind: "emoji", emoji: "🐊" });
  });
});

describe("sanitizeEmoji", () => {
  it("trims and accepts a short glyph", () => {
    expect(sanitizeEmoji(" 🐊 ")).toBe("🐊");
  });

  it("rejects empty, non-string and over-long values", () => {
    expect(sanitizeEmoji("")).toBeNull();
    expect(sanitizeEmoji("   ")).toBeNull();
    expect(sanitizeEmoji(42)).toBeNull();
    expect(sanitizeEmoji("not an emoji")).toBeNull();
  });

  it("rejects control characters", () => {
    expect(sanitizeEmoji("\u0000")).toBeNull();
    expect(sanitizeEmoji("🐊\u0007")).toBeNull();
  });
});

describe("technology slugs", () => {
  it("recognises every declared id and rejects others", () => {
    for (const id of TECHNOLOGY_IDS) {
      expect(isTechnologyId(id)).toBe(true);
    }
    expect(isTechnologyId("cobol")).toBe(false);
    expect(isTechnologyId(null)).toBe(false);
  });
});
