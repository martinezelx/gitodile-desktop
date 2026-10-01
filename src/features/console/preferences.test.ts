import { describe, expect, it } from "vitest";
import { DEFAULT_CONSOLE_PREFERENCES, normalizeConsolePreferences } from "./preferences";

describe("normalizeConsolePreferences", () => {
  it("keeps valid fields and defaults the rest one by one", () => {
    expect(normalizeConsolePreferences(null)).toEqual(DEFAULT_CONSOLE_PREFERENCES);
    expect(normalizeConsolePreferences({ autocomplete: false, textSize: "huge", welcome: "no" })).toEqual({
      ...DEFAULT_CONSOLE_PREFERENCES,
      autocomplete: false,
    });
    expect(normalizeConsolePreferences({ textSize: "large", cursorBlink: false })).toEqual({
      ...DEFAULT_CONSOLE_PREFERENCES,
      textSize: "large",
      cursorBlink: false,
    });
  });
});
