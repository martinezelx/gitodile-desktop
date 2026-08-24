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
  language: string,
  now = Date.now(),
): { relative: string; absolute: string } | null {
  const date = dateFromTimestamp(timestamp);
  if (!date) return null;
  const deltaSeconds = Math.round((date.getTime() - now) / 1_000);
  const absolute = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
  const relativeFormatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
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
