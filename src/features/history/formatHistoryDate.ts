import { formatDate, formatRelativeTime, type LocaleFormats } from "../../shared/i18n";

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
  /* Only the absolute date follows the format preference; the relative phrase
     is `formatRelativeTime` in `shared/i18n`, which the version-lines detail
     reads for the same kind of fact. */
  return { relative: formatRelativeTime(date, formats, now), absolute: formatDate(date, formats, "date-time") };
}
