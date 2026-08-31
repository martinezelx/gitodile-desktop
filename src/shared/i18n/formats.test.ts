import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatNumber,
  isDateFormatPreference,
  isNumberFormatPreference,
  type LocaleFormats,
} from "./formats";

const base: LocaleFormats = { language: "en", dateFormat: "system", numberFormat: "system" };

/* Local time on purpose: every caller formats a moment for the person sitting
   in front of the app, so a fixed UTC instant would assert the test machine's
   offset rather than the format. */
const moment = new Date(2026, 2, 9, 14, 5);

describe("formatDate", () => {
  it("writes each explicit format the same way regardless of language", () => {
    for (const language of ["en", "es"]) {
      expect(formatDate(moment, { ...base, language, dateFormat: "iso" })).toBe("2026-03-09");
      expect(formatDate(moment, { ...base, language, dateFormat: "day-first" })).toBe("09/03/2026");
      expect(formatDate(moment, { ...base, language, dateFormat: "month-first" })).toBe("03/09/2026");
    }
  });

  it("appends a 24-hour time only when one was asked for", () => {
    const formats = { ...base, dateFormat: "iso" } as const;
    expect(formatDate(moment, formats)).toBe("2026-03-09");
    expect(formatDate(moment, formats, "date-time")).toBe("2026-03-09 14:05");
  });

  it("follows the locale when the preference is the system default", () => {
    // Not asserted character by character: the point of `system` is that the
    // platform decides. What must hold is that the two locales disagree and
    // that both name the same day.
    const english = formatDate(moment, { ...base, language: "en" });
    const spanish = formatDate(moment, { ...base, language: "es" });
    expect(english).not.toBe(spanish);
    for (const written of [english, spanish]) {
      expect(written).toContain("2026");
      expect(written).toContain("9");
    }
  });

  it("answers with nothing rather than 'Invalid Date'", () => {
    expect(formatDate(new Date("nonsense"), { ...base, dateFormat: "iso" })).toBe("");
    expect(formatDate(new Date("nonsense"), base)).toBe("");
  });
});

describe("formatNumber", () => {
  it("groups and separates exactly as each choice names", () => {
    expect(formatNumber(1234567.89, { ...base, numberFormat: "comma-dot" })).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, { ...base, numberFormat: "dot-comma" })).toBe("1.234.567,89");
    // A narrow no-break space, so the number cannot be split across two lines.
    expect(formatNumber(1234567.89, { ...base, numberFormat: "space-comma" })).toBe(
      `1${String.fromCharCode(0x202f)}234${String.fromCharCode(0x202f)}567,89`,
    );
  });

  it("leaves whole numbers without a decimal mark", () => {
    expect(formatNumber(1000, { ...base, numberFormat: "dot-comma" })).toBe("1.000");
    expect(formatNumber(7, { ...base, numberFormat: "space-comma" })).toBe("7");
  });

  it("keeps the sign and does not borrow another locale's digits", () => {
    expect(formatNumber(-2500, { ...base, numberFormat: "dot-comma" })).toBe("-2.500");
  });

  it("follows the locale when the preference is the system default", () => {
    expect(formatNumber(1234.5, { ...base, language: "en" })).toBe("1,234.5");
  });

  it("answers with nothing for a value that is not a number", () => {
    expect(formatNumber(Number.NaN, base)).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY, { ...base, numberFormat: "comma-dot" })).toBe("");
  });
});

describe("stored preference validation", () => {
  it("accepts only the formats this app knows", () => {
    expect(isDateFormatPreference("iso")).toBe(true);
    expect(isDateFormatPreference("system")).toBe(true);
    expect(isDateFormatPreference("dd.mm.yyyy")).toBe(false);
    expect(isDateFormatPreference(null)).toBe(false);

    expect(isNumberFormatPreference("space-comma")).toBe(true);
    expect(isNumberFormatPreference("apostrophe")).toBe(false);
    expect(isNumberFormatPreference(undefined)).toBe(false);
  });
});
