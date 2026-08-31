/** How dates and numbers are spelled, independently of which language the
 * interface is in.
 *
 * The two are separate questions. A Spanish interface on a machine set to
 * `en-US` still writes `30/08/2026` if that is what the reader expects, and an
 * English interface can still group thousands with a dot. `system` keeps the
 * OS locale's own answer, which is the right default and the only one that can
 * be correct for a locale this file has never heard of.
 *
 * The explicit choices are spelled out here rather than delegated to a
 * substitute locale tag, because a locale is a bundle of decisions and
 * borrowing one to get a separator would silently borrow the rest of them. */

export const DATE_FORMATS = ["system", "iso", "day-first", "month-first"] as const;
export type DateFormatPreference = (typeof DATE_FORMATS)[number];

export const NUMBER_FORMATS = ["system", "comma-dot", "dot-comma", "space-comma"] as const;
export type NumberFormatPreference = (typeof NUMBER_FORMATS)[number];

/** Everything a formatted value depends on, passed as one object so a surface
 * that already threads `language` down threads this instead of three props. */
export type LocaleFormats = {
  language: string;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
};

export const DEFAULT_DATE_FORMAT: DateFormatPreference = "system";
export const DEFAULT_NUMBER_FORMAT: NumberFormatPreference = "system";

export function isDateFormatPreference(value: unknown): value is DateFormatPreference {
  return typeof value === "string" && DATE_FORMATS.some((format) => format === value);
}

export function isNumberFormatPreference(value: unknown): value is NumberFormatPreference {
  return typeof value === "string" && NUMBER_FORMATS.some((format) => format === value);
}

/** `date` is the calendar day alone; `date-time` adds the time of day, which
 * is what every surface showing "when this happened" already asked Intl for.
 * Nothing needs a time on its own yet, so nothing offers one. */
export type DateStyle = "date" | "date-time";

const pad = (value: number): string => String(value).padStart(2, "0");

/** 24-hour, and deliberately so: an explicit date format is a request for a
 * fixed spelling, and a 12-hour clock would reintroduce the locale variation
 * the choice was made to escape. `system` still follows the locale. */
function explicitTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(date: Date, formats: LocaleFormats, style: DateStyle = "date"): string {
  if (Number.isNaN(date.getTime())) return "";
  if (formats.dateFormat === "system") {
    return new Intl.DateTimeFormat(formats.language, {
      dateStyle: "medium",
      ...(style === "date-time" ? { timeStyle: "short" as const } : {}),
    }).format(date);
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const calendarDay =
    formats.dateFormat === "iso"
      ? `${year}-${month}-${day}`
      : formats.dateFormat === "day-first"
        ? `${day}/${month}/${year}`
        : `${month}/${day}/${year}`;
  return style === "date-time" ? `${calendarDay} ${explicitTime(date)}` : calendarDay;
}

/** Named rather than typed: an ordinary space would let a grouped number wrap
 * across two lines, and the character that would not is invisible in a diff. */
const NARROW_NO_BREAK_SPACE = String.fromCharCode(0x202f);

/** Each explicit choice's separators: the grouping mark, then the decimal. */
const NUMBER_SEPARATORS: Record<Exclude<NumberFormatPreference, "system">, [string, string]> = {
  "comma-dot": [",", "."],
  "dot-comma": [".", ","],
  "space-comma": [NARROW_NO_BREAK_SPACE, ","],
};

export function formatNumber(value: number, formats: LocaleFormats): string {
  if (!Number.isFinite(value)) return "";
  if (formats.numberFormat === "system") {
    return new Intl.NumberFormat(formats.language).format(value);
  }
  const [group, decimal] = NUMBER_SEPARATORS[formats.numberFormat];
  // Grouped by `en-US`, whose two separators are known single ASCII
  // characters, then split on them and rejoined. Asking Intl for whichever
  // locale happens to use the wanted marks would also inherit its digits, its
  // grouping size and its minus sign.
  const [whole, fraction] = new Intl.NumberFormat("en-US").format(value).split(".");
  const grouped = (whole ?? "").split(",").join(group);
  return fraction === undefined ? grouped : `${grouped}${decimal}${fraction}`;
}

/** One date and one number for the Settings preview. Fixed values rather than
 * "now", so the shape of each choice is comparable at a glance and does not
 * change while the panel is open. */
export const FORMAT_SAMPLE_DATE = new Date(2026, 2, 9, 14, 5);
export const FORMAT_SAMPLE_NUMBER = 1234567.89;
