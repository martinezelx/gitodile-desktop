import { describe, expect, it } from "vitest";

import {
  REMOTE_CHECK_MAX_MINUTES,
  combineRemoteCheckInterval,
  isRemoteCheckIntervalMinutes,
  isRemoteCheckPreset,
  splitRemoteCheckInterval,
} from "./domain";

describe("automatic remote-check cadence", () => {
  it("accepts any whole number of minutes inside the bounds, and zero for off", () => {
    expect(isRemoteCheckIntervalMinutes(0)).toBe(true);
    expect(isRemoteCheckIntervalMinutes(1)).toBe(true);
    expect(isRemoteCheckIntervalMinutes(5)).toBe(true);
    expect(isRemoteCheckIntervalMinutes(300)).toBe(true);
    expect(isRemoteCheckIntervalMinutes(REMOTE_CHECK_MAX_MINUTES)).toBe(true);
  });

  it("rejects fractions, negatives and anything past a day", () => {
    expect(isRemoteCheckIntervalMinutes(0.5)).toBe(false);
    expect(isRemoteCheckIntervalMinutes(-15)).toBe(false);
    expect(isRemoteCheckIntervalMinutes(REMOTE_CHECK_MAX_MINUTES + 1)).toBe(false);
    expect(isRemoteCheckIntervalMinutes("30")).toBe(false);
    expect(isRemoteCheckIntervalMinutes(Number.NaN)).toBe(false);
  });

  it("still recognises the four presets, which is what selects a segment", () => {
    expect(isRemoteCheckPreset(0)).toBe(true);
    expect(isRemoteCheckPreset(60)).toBe(true);
    expect(isRemoteCheckPreset(5)).toBe(false);
    expect(isRemoteCheckPreset(300)).toBe(false);
  });

  it("shows hours only for a whole number of them", () => {
    expect(splitRemoteCheckInterval(300)).toEqual({ value: 5, unit: "hours" });
    expect(splitRemoteCheckInterval(60)).toEqual({ value: 1, unit: "hours" });
    // 90 minutes is not 1.5 hours in a field that only takes whole numbers.
    expect(splitRemoteCheckInterval(90)).toEqual({ value: 90, unit: "minutes" });
    expect(splitRemoteCheckInterval(5)).toEqual({ value: 5, unit: "minutes" });
  });

  it("converts a typed pair back to minutes, or refuses it outright", () => {
    expect(combineRemoteCheckInterval(5, "minutes")).toBe(5);
    expect(combineRemoteCheckInterval(5, "hours")).toBe(300);
    expect(combineRemoteCheckInterval(24, "hours")).toBe(REMOTE_CHECK_MAX_MINUTES);
    // Refused rather than clamped: silently running a cadence nobody chose is
    // worse than saying the number is out of range.
    expect(combineRemoteCheckInterval(25, "hours")).toBeNull();
    expect(combineRemoteCheckInterval(0, "minutes")).toBeNull();
    expect(combineRemoteCheckInterval(-1, "hours")).toBeNull();
    expect(combineRemoteCheckInterval(1.5, "hours")).toBeNull();
  });

  it("round-trips every value the custom field can produce", () => {
    for (const minutes of [1, 5, 45, 90, 300, REMOTE_CHECK_MAX_MINUTES]) {
      const { value, unit } = splitRemoteCheckInterval(minutes);
      expect(combineRemoteCheckInterval(value, unit)).toBe(minutes);
    }
  });
});
