import { formatDate, type LocaleFormats } from "../../shared/i18n";

import type { HistoryTimestamp } from "./domain";

function dateFromTimestamp(timestamp: HistoryTimestamp | null): Date | null {
  if (!timestamp || !Number.isFinite(timestamp.unixSeconds)) return null;
  const date = new Date(timestamp.unixSeconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Shared presentation formatter for every surface that previews History.
 * Keeping it outside the full History panel lets eager surfaces reuse the
 * exact same relative and absolute dates without pulling in the diff viewer. */
export function formatHistoryDate(
  timestamp: HistoryTimestamp | null,
  formats: LocaleFormats,
  now = Date.now(),
): { relative: string; absolute: string } | null {
  const date = dateFromTimestamp(timestamp);
  if (!date) return null;
  const deltaSeconds = Math.round((date.getTime() - now) / 1_000);
  /* Only the absolute date follows the format preference. "3 days ago" has no
     separators to choose between, and it is the language — not the date
     format — that decides how it is worded. */
  const absolute = formatDate(date, formats, "date-time");
  const relativeFormatter = new Intl.RelativeTimeFormat(formats.language, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["week", 7 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const [unit, seconds] = units.find(([, size]) => Math.abs(deltaSeconds) >= size) ?? ["second", 1];
  return { relative: relativeFormatter.format(Math.round(deltaSeconds / seconds), unit), absolute };
}
