import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  Columns2,
  FileMinus,
  FilePlus,
  FileQuestion,
  FileWarning,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Rows3,
  Save,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "./i18n";
import { localizeAppError } from "./appError";
import { getFileTypeIcon } from "./fileIcons";
import { autoHideScrollbarProps } from "./autoHideScrollbar";
import { SaveVersionDialog } from "./saveVersionDialog";
import { fetchDiff, getDiffStore, type DiffCache } from "./diffCache";
import { LoadingBar } from "./loadingBar";
import { getOrderedChangeEntries, splitPath } from "./repositoryOverview";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "./repositoryOverview";

// ---- Types mirroring the Rust `FileDiff` contract (src-tauri/src/lib.rs) ----
// Rust owns Git's diff grammar entirely; this module only renders the typed
// result. It never parses patch text.

export type DiffLineKind = "context" | "addition" | "deletion";

export type DiffLine = {
  kind: DiffLineKind;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type FileDiff =
  | {
      kind: "text";
      path: string;
      originalPath: string | null;
      change: ChangeCategory;
      hunks: DiffHunk[];
      truncated: boolean;
    }
  | { kind: "binary"; path: string; originalPath: string | null; change: ChangeCategory }
  | {
      kind: "too-large";
      path: string;
      originalPath: string | null;
      change: ChangeCategory;
      limitBytes: number;
    }
  | { kind: "conflict"; path: string; hunks: DiffHunk[]; truncated: boolean; detail: string | null }
  | { kind: "unchanged"; path: string; originalPath: string | null; change: ChangeCategory };

// ---- Pure list ordering ----

// Ordering and path splitting live in `repositoryOverview` so Overview's
// changes preview can share them without importing this module — which would
// pull the whole Changes screen (and the file-type icon set) into the initial
// bundle. Re-exported here so this screen's own consumers keep their import.
export { getOrderedChangeEntries };

/** Preserves the current selection if it is still present in `entries`,
 * otherwise falls back to the first entry (or `null` if the list is empty). */
export function resolveSelectedPath(entries: WorkingTreeEntry[], previousPath: string | null): string | null {
  if (previousPath !== null && entries.some((entry) => entry.path === previousPath)) {
    return previousPath;
  }
  return entries[0]?.path ?? null;
}

/** Case-insensitive substring match over the whole repository-relative path,
 * so typing either a file name or a folder narrows the list — the same
 * behavior the Version lines screen's search box has. An all-whitespace query
 * is treated as no query at all, rather than as a filter nothing matches. */
export function filterEntriesBySearch(entries: WorkingTreeEntry[], search: string): WorkingTreeEntry[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return entries;
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(query));
}

export type DiffLineTotals = { added: number; removed: number };

/** Added and removed line counts for one file's diff. Only `text` and
 * `conflict` diffs carry hunks; the binary/too-large/unchanged kinds
 * contribute nothing, which is the honest answer — GitOdrile never read their
 * contents. */
export function countDiffLines(diff: FileDiff): DiffLineTotals {
  const totals = { added: 0, removed: 0 };
  if (diff.kind !== "text" && diff.kind !== "conflict") {
    return totals;
  }
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "addition") {
        totals.added += 1;
      } else if (line.kind === "deletion") {
        totals.removed += 1;
      }
    }
  }
  return totals;
}

/** Screen-wide totals, summed over whichever diffs the snapshot's cache
 * currently holds. Returns `null` until every listed file is present, so the
 * subtitle shows nothing rather than a number that keeps climbing while the
 * batch prefetch fills in — a total that is briefly wrong is worse than one
 * that is briefly absent. */
/** True when a diff's line counts would be a floor rather than the answer:
 * Git stopped early (`truncated`), or the file was never read at all
 * (`too-large`). Binary and unchanged files are not in this set — they
 * genuinely contribute no lines, which is a fact, not a gap. */
function hasUncountableLines(diff: FileDiff): boolean {
  if (diff.kind === "too-large") {
    return true;
  }
  return (diff.kind === "text" || diff.kind === "conflict") && diff.truncated;
}

export function sumCachedDiffLines(entries: WorkingTreeEntry[], cache: Map<string, FileDiff>): DiffLineTotals | null {
  if (entries.length === 0) {
    return null;
  }
  const totals = { added: 0, removed: 0 };
  for (const entry of entries) {
    const diff = cache.get(entry.path);
    // Same rule for "not read yet" and "cannot be counted": show nothing
    // rather than a total the user would read as exact. A subtitle that
    // quietly understates a huge change set is worse than one that omits the
    // number until it can be trusted.
    if (!diff || hasUncountableLines(diff)) {
      return null;
    }
    const fileTotals = countDiffLines(diff);
    totals.added += fileTotals.added;
    totals.removed += fileTotals.removed;
  }
  return totals;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** How to word "when was this last checked". Coarse buckets on purpose: the
 * point is confidence that the screen is current, not a stopwatch, and a
 * label that ticks every second is noise beside a list the user is reading.
 * Anything past a day stops counting — at that age the number is no longer
 * the useful part of the answer. */
export type CheckFreshness =
  { unit: "now" } | { unit: "minutes"; value: number } | { unit: "hours"; value: number } | { unit: "long-ago" };

export function getCheckFreshness(checkedAt: number, now: number): CheckFreshness {
  const elapsed = Math.max(0, now - checkedAt);
  if (elapsed < MINUTE_MS) {
    return { unit: "now" };
  }
  if (elapsed < HOUR_MS) {
    return { unit: "minutes", value: Math.floor(elapsed / MINUTE_MS) };
  }
  if (elapsed < 24 * HOUR_MS) {
    return { unit: "hours", value: Math.floor(elapsed / HOUR_MS) };
  }
  return { unit: "long-ago" };
}

export function formatCheckFreshness(freshness: CheckFreshness, t: Translations): string {
  switch (freshness.unit) {
    case "now":
      return t.changesCheckedJustNow;
    case "minutes":
      return t.changesCheckedMinutesAgo(freshness.value);
    case "hours":
      return t.changesCheckedHoursAgo(freshness.value);
    case "long-ago":
      return t.changesCheckedLongAgo;
  }
}

/** The "Checked just now" line beside the refresh button. Re-renders on its
 * own timer rather than on the screen's, so the wording ages while the user
 * reads — a minute-granularity label only needs a minute-granularity tick. */
function CheckFreshnessNote({
  checkedAt,
  isChecking,
  t,
}: {
  checkedAt: number | null;
  isChecking: boolean;
  t: Translations;
}): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (isChecking) {
    return (
      <span className="changes-freshness" role="status">
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
        {t.statusRefreshing}
      </span>
    );
  }
  if (checkedAt === null) {
    return null;
  }
  return (
    <span className="changes-freshness" role="status">
      {formatCheckFreshness(getCheckFreshness(checkedAt, now), t)}
      <CheckCircle2 aria-hidden="true" className="changes-freshness__icon" />
    </span>
  );
}

function formatByteLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

export const CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged",
  new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted",
  renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

type DiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; diff: FileDiff };

const DIFF_LOADING_DELAY_MS = 140;
/** How many files on each side of the current selection get quietly
 * prefetched in the background. Small on purpose: this rides on the same
 * per-file `git diff` process spawn as a real click, so it trades a couple
 * of extra background processes for near-instant "next file" clicks during
 * the common sequential-review flow, without eagerly fetching an entire
 * (possibly huge) change set up front. */
const PREFETCH_RADIUS = 2;

function EmptyDiffNote({
  icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "attention";
}): React.JSX.Element {
  return (
    <div className={`changes-diff__note changes-diff__note--${tone}`}>
      <div className="changes-diff__note-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function DiffLineRow({ line, t }: { line: DiffLine; t: Translations }): React.JSX.Element {
  const sign = line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " ";
  const label =
    line.kind === "addition" ? t.changesLineAddedLabel : line.kind === "deletion" ? t.changesLineRemovedLabel : null;
  // One column, not two: a context line's old and new numbers are often the
  // same (or a line apart), so showing both read as the number appearing
  // twice. The new-file number is the meaningful one for context/additions;
  // a deletion has no new number, so it falls back to the old one.
  const lineNumber = line.newLineNumber ?? line.oldLineNumber;

  return (
    <div className={`diff-line diff-line--${line.kind}`}>
      <span className="diff-line__number">{lineNumber ?? ""}</span>
      <span className="diff-line__sign" aria-hidden="true">
        {sign}
      </span>
      {label && <span className="visually-hidden">{label}</span>}
      <span className="diff-line__content">{line.content}</span>
    </div>
  );
}

/** The run of unchanged lines sitting between this hunk and the previous one
 * (or the start of the file, for the first hunk) — computed from the same
 * `oldStart`/`oldLines` fields Rust already provides, so no raw `@@ -a,b +c,d
 * @@` syntax needs to reach a beginner-facing screen.
 *
 * Both coordinate systems are carried, not just the count: the gap has to be
 * *fetched* to be expanded, and the file on disk is the new side, while the
 * expanded lines still need old-side numbers to render like any other context
 * line. The two starts differ by however much the hunks above added or
 * removed. */
export type HunkGap = { hiddenLines: number; oldStart: number; newStart: number };

export function gapBeforeHunk(hunk: DiffHunk, previousHunk: DiffHunk | null): HunkGap {
  const previousOldEnd = previousHunk ? previousHunk.oldStart + previousHunk.oldLines : 1;
  const previousNewEnd = previousHunk ? previousHunk.newStart + previousHunk.newLines : 1;
  return {
    hiddenLines: Math.max(0, hunk.oldStart - previousOldEnd),
    oldStart: previousOldEnd,
    newStart: previousNewEnd,
  };
}

/** Lines already pulled in for one gap, keyed by hunk index. Expansion is
 * incremental: the backend caps how much one request may return, so a very
 * large gap fills in over repeated clicks and `lines.length` doubles as the
 * offset the next request starts from. */
export type GapExpansion = { lines: string[] };
export type GapExpansions = Record<number, GapExpansion>;

/** Turns the part of a gap that has been fetched into ordinary context rows.
 * They are indistinguishable from the context lines Git itself supplied,
 * which is the point: an expanded gap should read as more of the same file,
 * not as a separate pasted-in region. */
function expandedGapLines(gap: HunkGap, expansion: GapExpansion): DiffLine[] {
  return expansion.lines.map((content, offset) => ({
    kind: "context" as const,
    content,
    oldLineNumber: gap.oldStart + offset,
    newLineNumber: gap.newStart + offset,
  }));
}

/** One renderable row of a diff: either the "N unchanged lines" marker that
 * opens a hunk, or a single line within it. Flattening every hunk into one
 * list of rows (rather than nesting them, as the DOM used to) is what makes
 * the list virtualizable below — a virtualizer needs one flat, indexable
 * sequence of same-shaped items, not a tree. */
export type DiffRow =
  | { kind: "marker"; hunkIndex: number; hiddenLines: number; gap: HunkGap }
  | { kind: "line"; hunkIndex: number; line: DiffLine };

export function flattenDiffRows(hunks: DiffHunk[], expansions: GapExpansions = {}): DiffRow[] {
  const rows: DiffRow[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const gap = gapBeforeHunk(hunk, hunks[hunkIndex - 1] ?? null);
    if (gap.hiddenLines > 0) {
      const expansion = expansions[hunkIndex];
      if (expansion) {
        for (const line of expandedGapLines(gap, expansion)) {
          rows.push({ kind: "line", hunkIndex, line });
        }
      }
      // Whatever is still unfetched keeps its marker, so a gap too big for
      // one request stays expandable instead of stopping half-open with no
      // way forward.
      const remaining = gap.hiddenLines - (expansion?.lines.length ?? 0);
      if (remaining > 0) {
        rows.push({ kind: "marker", hunkIndex, hiddenLines: remaining, gap });
      }
    }
    for (const line of hunk.lines) {
      rows.push({ kind: "line", hunkIndex, line });
    }
  });
  return rows;
}

/** A row is the first of its hunk when nothing before it in `rows` shares
 * the same `hunkIndex` — used to draw the dashed separator between hunks
 * that DOM nesting (one `.diff-hunk` wrapper per hunk) used to provide for
 * free via a `.diff-hunk + .diff-hunk` sibling selector. Flattening for
 * virtualization means every row is now a sibling, so that boundary has to
 * be marked per-row instead. */
export function isFirstRowOfHunk(rows: { hunkIndex: number }[], index: number): boolean {
  return index === 0 || rows[index - 1].hunkIndex !== rows[index].hunkIndex;
}

export type DiffViewMode = "unified" | "split";

/** One row of the side-by-side view: the same "N unchanged lines" marker the
 * unified view uses, or a pair of cells. A pair is one context line shown in
 * both columns, or a deletion opposite the addition that replaced it — with
 * `null` on either side when one run is longer than the other. */
export type SplitRow =
  | { kind: "marker"; hunkIndex: number; hiddenLines: number; gap: HunkGap }
  | {
      kind: "pair";
      hunkIndex: number;
      left: DiffLine | null;
      right: DiffLine | null;
    };

/** Pairs each run of deletions with the run of additions that follows it,
 * which is what makes a side-by-side diff readable: an edited line and its
 * replacement land on the same row instead of one below the other. Runs are
 * flushed at every context line (and at the end of a hunk), so an unbalanced
 * edit — three lines replaced by one — leaves empty cells rather than pairing
 * across an unrelated section of the file. */
export function buildSplitRows(hunks: DiffHunk[], expansions: GapExpansions = {}): SplitRow[] {
  const rows: SplitRow[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const gap = gapBeforeHunk(hunk, hunks[hunkIndex - 1] ?? null);
    if (gap.hiddenLines > 0) {
      const expansion = expansions[hunkIndex];
      if (expansion) {
        // An unchanged line is identical on both sides, so it fills the row.
        for (const line of expandedGapLines(gap, expansion)) {
          rows.push({ kind: "pair", hunkIndex, left: line, right: line });
        }
      }
      const remaining = gap.hiddenLines - (expansion?.lines.length ?? 0);
      if (remaining > 0) {
        rows.push({ kind: "marker", hunkIndex, hiddenLines: remaining, gap });
      }
    }
    let deletions: DiffLine[] = [];
    let additions: DiffLine[] = [];
    const flush = (): void => {
      const pairCount = Math.max(deletions.length, additions.length);
      for (let index = 0; index < pairCount; index += 1) {
        rows.push({
          kind: "pair",
          hunkIndex,
          left: deletions[index] ?? null,
          right: additions[index] ?? null,
        });
      }
      deletions = [];
      additions = [];
    };
    for (const line of hunk.lines) {
      if (line.kind === "deletion") {
        deletions.push(line);
      } else if (line.kind === "addition") {
        additions.push(line);
      } else {
        flush();
        rows.push({ kind: "pair", hunkIndex, left: line, right: line });
      }
    }
    flush();
  });
  return rows;
}

/** Index of the row that opens each hunk, so the toolbar's change navigation
 * can scroll straight to it. The opening row is the "N unchanged lines"
 * marker when there is one — it reads as the change's own heading — and the
 * first line of the hunk otherwise. */
export function getHunkStartRows(rows: { hunkIndex: number }[], hunkCount: number): number[] {
  const starts: number[] = new Array(hunkCount).fill(-1);
  rows.forEach((row, index) => {
    if (starts[row.hunkIndex] === -1) {
      starts[row.hunkIndex] = index;
    }
  });
  return starts;
}

/** Starting guesses for `useVirtualizer`. `measureElement` corrects each row
 * once it has actually rendered, so these only have to be close — but "close"
 * matters more than it looks: every row the virtualizer has not measured yet
 * is placed using its estimate, so a systematically wrong estimate offsets
 * everything below it and the list visibly re-shuffles as real measurements
 * arrive.
 *
 * That is exactly what a flat per-line guess used to cause here. `.diff-line__content`
 * is `white-space: pre-wrap` with `overflow-wrap: anywhere` (it was `pre` when
 * this estimate was written), so a long line wraps onto two or three visual
 * lines and is two or three times taller than a one-line guess. The diff is
 * monospace, though, which makes the real height computable rather than
 * guessable: see `estimateLineRows`. */
const ESTIMATED_MARKER_ROW_HEIGHT = 32;
/** Fallback for before the first measurement lands, matching the CSS's
 * `font: 12.5px/1.6` line box. */
const FALLBACK_LINE_HEIGHT = 20;
/** Everything in `.diff-line` that isn't the content column: the 48px number
 * gutter and 16px sign column from its `grid-template-columns`, plus its own
 * 16px `padding-right`. Kept in sync with that rule in styles.css. */
const DIFF_CONTENT_GUTTER = 80;

/** Advance width of one character, per resolved font. The diff is monospace,
 * so a single sample describes every glyph — which is what lets the estimate
 * below be arithmetic instead of a guess.
 *
 * Measured with a throwaway span *inside* the diff element rather than via
 * canvas: it inherits the real font that way (no shorthand to rebuild and
 * keep in sync), and it goes through the same layout path that will actually
 * wrap the lines. Sampled over many characters so sub-pixel advances don't
 * round away. Cached because a resize would otherwise force a layout on
 * every frame of a drag. */
const SAMPLE_TEXT = "0".repeat(100);
const charWidthByFont = new Map<string, number>();

function measureCharWidth(element: HTMLElement, fontKey: string): number {
  const cached = charWidthByFont.get(fontKey);
  if (cached !== undefined) {
    return cached;
  }
  const probe = document.createElement("span");
  probe.textContent = SAMPLE_TEXT;
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
  element.appendChild(probe);
  const width = probe.getBoundingClientRect().width / SAMPLE_TEXT.length;
  probe.remove();
  if (width > 0) {
    charWidthByFont.set(fontKey, width);
  }
  return width;
}

const COMBINING_MARK = /\p{Mark}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Terminal-style display width for the exceptional glyphs that invalidate
 * JavaScript string length as a wrapping estimate. The ordinary source-code
 * path stays one column per code point; combining marks and joiners consume
 * none, while CJK/full-width characters and emoji consume two. */
function codePointColumns(symbol: string): number {
  const codePoint = symbol.codePointAt(0) ?? 0;
  if (
    COMBINING_MARK.test(symbol) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return 0;
  }
  if (
    EXTENDED_PICTOGRAPHIC.test(symbol) ||
    (codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
        (codePoint >= 0x1b000 && codePoint <= 0x1ffff) ||
        (codePoint >= 0x20000 && codePoint <= 0x3fffd)))
  ) {
    return 2;
  }
  return 1;
}

/** Everything in a `.diff-split-row` that isn't one of its two content
 * columns: two 40px number gutters, two 14px sign columns, the divider
 * between the halves, and the row's own right padding. Kept in sync with
 * `.diff-split-row`'s `grid-template-columns` in styles.css. */
const DIFF_SPLIT_CONTENT_GUTTER = 125;

/** How many visual rows a pre-wrapped diff line is likely to occupy before
 * the browser can measure it. This deliberately models tabs and Unicode
 * display columns instead of using UTF-16 `string.length`; the live DOM
 * measurement remains authoritative because font fallback can still vary. */
export function estimateLineRows(content: string, charsPerLine: number, tabSize = 8): number {
  if (charsPerLine <= 0) {
    return 1;
  }
  let rows = 1;
  let column = 0;
  for (const symbol of content) {
    const width = symbol === "\t"
      ? Math.max(1, tabSize - (column % tabSize))
      : codePointColumns(symbol);
    if (width === 0) continue;
    if (column > 0 && column + width > charsPerLine) {
      rows += 1;
      column = 0;
    }
    column += width;
    while (column > charsPerLine) {
      rows += 1;
      column -= charsPerLine;
    }
  }
  return rows;
}

export function measureDiffRowHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height +
    (Number.parseFloat(window.getComputedStyle(element).marginTop) || 0);
}

/** Renders only the diff rows currently scrolled into view (plus a small
 * overscan buffer), instead of the whole file's worth of DOM nodes at once.
 * A large file with thousands of changed lines (this codebase's own
 * `lib.rs` is a good stress test) would otherwise force the browser to lay
 * out and paint every line up front just to show the first screenful,
 * which is the actual source of "it's a bit laggy to open" — not the Git
 * read, which the caching/prefetch/batching above already made fast. */
function DiffSplitCell({
  line,
  side,
  t,
}: {
  line: DiffLine | null;
  side: "old" | "new";
  t: Translations;
}): React.JSX.Element {
  if (!line) {
    // A cell with no counterpart still has to occupy its two grid columns, or
    // the row's other half slides across the divider.
    return (
      <>
        <span className="diff-line__number diff-line__number--empty" />
        <span className="diff-split-cell diff-split-cell--empty" />
      </>
    );
  }
  const label =
    line.kind === "addition" ? t.changesLineAddedLabel : line.kind === "deletion" ? t.changesLineRemovedLabel : null;
  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;
  return (
    <>
      <span className="diff-line__number">{lineNumber ?? ""}</span>
      <span className={`diff-split-cell diff-split-cell--${line.kind}`}>
        <span className="diff-line__sign" aria-hidden="true">
          {line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}
        </span>
        {label && <span className="visually-hidden">{label}</span>}
        <span className="diff-line__content">{line.content}</span>
      </span>
    </>
  );
}

/** The "Show N unchanged lines" control that opens a gap between hunks.
 * A button rather than a static caption because the lines behind it are
 * genuinely fetchable — the diff never carried them, so this is the only way
 * to read the code around a change without leaving the app. */
function GapMarker({
  hiddenLines,
  state,
  onExpand,
  t,
}: {
  hiddenLines: number;
  state: "idle" | "loading" | "error";
  /** `null` when this diff's gaps can't be fetched — the marker then stays
   * the caption it always was, rather than offering an action that would
   * either do nothing or show the wrong lines. */
  onExpand: (() => void) | null;
  t: Translations;
}): React.JSX.Element {
  if (!onExpand) {
    return <div className="diff-hunk__marker diff-hunk__marker--static">{t.changesDiffHiddenLines(hiddenLines)}</div>;
  }
  return (
    <div className="diff-hunk__marker">
      <button
        type="button"
        className="diff-hunk__expand"
        onClick={onExpand}
        disabled={state === "loading"}
        aria-label={t.changesDiffShowHiddenLines(hiddenLines)}
      >
        <ChevronsUpDown aria-hidden="true" />
        {state === "loading" ? t.commonLoading : t.changesDiffShowHiddenLines(hiddenLines)}
      </button>
      {state === "error" && (
        <span className="diff-hunk__expand-error" role="alert">
          {t.changesDiffExpandFailed}
        </span>
      )}
    </div>
  );
}

function DiffHunkList({
  hunks,
  projectPath,
  filePath,
  viewMode,
  hunkTarget,
  t,
}: {
  hunks: DiffHunk[];
  /** Both needed to fetch a gap's lines: they are not in the diff at all.
   * A `null` project path means this diff isn't expandable — see
   * `DiffResultView`'s note. */
  projectPath: string | undefined;
  filePath: string;
  viewMode: DiffViewMode;
  /** The hunk the toolbar last navigated to. `token` (rather than the index
   * alone) is what makes a repeated press of the same button scroll again
   * instead of silently doing nothing because the index did not change. */
  hunkTarget: { index: number; token: number };
  t: Translations;
}): React.JSX.Element {
  // Which gaps the user has opened, and how far. Keyed by hunk index, so it
  // survives switching view modes (both builders read the same map) but is
  // reset per file below — an expansion describes one file's gaps and means
  // nothing for the next one.
  const [expansions, setExpansions] = useState<GapExpansions>({});
  const [expandingHunk, setExpandingHunk] = useState<number | null>(null);
  const [expandError, setExpandError] = useState<number | null>(null);
  // Read inside the request's `.then`, so a response that lands after the
  // user has moved to another file can be recognized as stale. Without it
  // the effect below would clear the expansions on the file switch and the
  // late response would immediately re-fill them — showing one file's lines
  // inside another's diff, indistinguishable from real context.
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  useEffect(() => {
    setExpansions({});
    setExpandingHunk(null);
    setExpandError(null);
  }, [filePath]);

  const expandGap = (hunkIndex: number, gap: HunkGap): void => {
    if (projectPath === undefined || expandingHunk !== null) {
      return;
    }
    const requestedPath = filePath;
    const alreadyLoaded = expansions[hunkIndex]?.lines.length ?? 0;
    setExpandingHunk(hunkIndex);
    setExpandError(null);
    invoke<{ startLine: number; lines: string[]; truncated: boolean }>("read_file_lines", {
      path: projectPath,
      filePath: requestedPath,
      startLine: gap.newStart + alreadyLoaded,
      endLine: gap.newStart + gap.hiddenLines - 1,
    })
      .then((result) => {
        if (filePathRef.current !== requestedPath) {
          return;
        }
        setExpansions((current) => ({
          ...current,
          [hunkIndex]: { lines: [...(current[hunkIndex]?.lines ?? []), ...result.lines] },
        }));
      })
      .catch(() => {
        // Deliberately not localized through `localizeAppError`: this is a
        // one-line note inside a diff row, not a screen-level failure, and
        // the only useful next step is "try again", which the button still is.
        if (filePathRef.current === requestedPath) {
          setExpandError(hunkIndex);
        }
      })
      .finally(() => setExpandingHunk(null));
  };

  const rows = useMemo(
    () => (viewMode === "split" ? buildSplitRows(hunks, expansions) : flattenDiffRows(hunks, expansions)),
    [hunks, viewMode, expansions],
  );
  const hunkStartRows = useMemo(() => getHunkStartRows(rows, hunks.length), [rows, hunks.length]);
  const scrollRef = useRef<HTMLPreElement>(null);
  /** Where lines wrap, and how tall a wrapped line is — both read from the
   * live element rather than hardcoded, so the estimate follows the CSS and
   * the pane's current width (the sidebar collapsing changes both). Split
   * view halves the space a line has, so it gets its own wrap point rather
   * than reusing the unified one. */
  const [metrics, setMetrics] = useState({
    charsPerLine: 0,
    splitCharsPerLine: 0,
    lineHeight: FALLBACK_LINE_HEIGHT,
    tabSize: 8,
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const readMetrics = (): void => {
      const style = window.getComputedStyle(element);
      const charWidth = measureCharWidth(element, `${style.font} ${style.letterSpacing}`);
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const parsedTabSize = Number.parseFloat(style.tabSize);
      const contentWidth = element.clientWidth - DIFF_CONTENT_GUTTER;
      const splitContentWidth = (element.clientWidth - DIFF_SPLIT_CONTENT_GUTTER) / 2;
      setMetrics((previous) => {
        const next = {
          charsPerLine: charWidth > 0 && contentWidth > 0 ? Math.floor(contentWidth / charWidth) : 0,
          splitCharsPerLine: charWidth > 0 && splitContentWidth > 0 ? Math.floor(splitContentWidth / charWidth) : 0,
          lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : FALLBACK_LINE_HEIGHT,
          tabSize: Number.isFinite(parsedTabSize) && parsedTabSize > 0 ? parsedTabSize : 8,
        };
        // Bail out on no-op resizes: this runs from a ResizeObserver, and
        // setting state unconditionally there would loop.
        return previous.charsPerLine === next.charsPerLine &&
          previous.splitCharsPerLine === next.splitCharsPerLine &&
          previous.lineHeight === next.lineHeight &&
          previous.tabSize === next.tabSize
          ? previous
          : next;
      });
    };

    readMetrics();
    const observer = new ResizeObserver(readMetrics);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row.kind === "marker") {
        return ESTIMATED_MARKER_ROW_HEIGHT;
      }
      if (row.kind === "line") {
        return estimateLineRows(row.line.content, metrics.charsPerLine, metrics.tabSize) * metrics.lineHeight;
      }
      // A split row is as tall as its taller half.
      const visualRows = Math.max(
        row.left ? estimateLineRows(row.left.content, metrics.splitCharsPerLine, metrics.tabSize) : 1,
        row.right ? estimateLineRows(row.right.content, metrics.splitCharsPerLine, metrics.tabSize) : 1,
      );
      return visualRows * metrics.lineHeight;
    },
    // `getBoundingClientRect` excludes margins, so without this the 12px
    // `margin-top` on `.diff-row--hunk-start` is missing from every measured
    // hunk boundary and the rows below it drift up by that much per hunk.
    measureElement: measureDiffRowHeight,
    overscan: 12,
  });

  // A new wrap point invalidates every estimate, including rows already
  // measured at the old width.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [metrics.charsPerLine, metrics.splitCharsPerLine, metrics.lineHeight, metrics.tabSize, viewMode]);

  // `hunkStartRows` moves whenever the row list does — including when a gap
  // is expanded, which inserts rows. Reading it through a ref keeps it out of
  // the effect's dependencies: only an explicit navigation (a new `token`) or
  // a view-mode switch should scroll. With it as a dependency, expanding a
  // gap re-ran this and yanked the view back to the last change the toolbar
  // pointed at — the opposite of what someone who just asked to read the
  // lines above it wants.
  const hunkStartRowsRef = useRef(hunkStartRows);
  hunkStartRowsRef.current = hunkStartRows;

  // Scrolls to whichever change the toolbar last pointed at. `scrollToIndex`
  // rather than a DOM lookup because the target row is usually not rendered
  // yet — that is the whole point of virtualizing the list.
  useEffect(() => {
    const rowIndex = hunkStartRowsRef.current[hunkTarget.index];
    if (rowIndex === undefined || rowIndex < 0) {
      return;
    }
    virtualizer.scrollToIndex(rowIndex, { align: "start" });
  }, [hunkTarget.token, viewMode]);

  return (
    <pre
      {...autoHideScrollbarProps<HTMLPreElement>()}
      className="diff-code auto-hide-scrollbar"
      tabIndex={0}
      ref={scrollRef}
    >
      <code style={{ display: "block", position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          // The "N unchanged lines" chip already signals the jump between
          // hunks on its own, so the dashed hunk-start border is reserved for
          // a line row that opens a hunk directly (no marker before it) —
          // applying it to the marker row too stacked its own vertical
          // margin with the border's `padding-top`, pushing the chip down
          // and off-center on every hunk after the first.
          const isHunkStart = row.kind !== "marker" && row.hunkIndex > 0 && isFirstRowOfHunk(rows, virtualRow.index);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={isHunkStart ? "diff-row diff-row--hunk-start" : "diff-row"}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === "marker" ? (
                <GapMarker
                  hiddenLines={row.hiddenLines}
                  state={
                    expandingHunk === row.hunkIndex
                      ? "loading"
                      : expandError === row.hunkIndex
                        ? "error"
                        : "idle"
                  }
                  onExpand={projectPath === undefined ? null : () => expandGap(row.hunkIndex, row.gap)}
                  t={t}
                />
              ) : row.kind === "line" ? (
                <DiffLineRow line={row.line} t={t} />
              ) : (
                <div className="diff-split-row">
                  <DiffSplitCell line={row.left} side="old" t={t} />
                  <DiffSplitCell line={row.right} side="new" t={t} />
                </div>
              )}
            </div>
          );
        })}
      </code>
    </pre>
  );
}

export function DiffResultView({
  diff,
  projectPath,
  viewMode = "unified",
  hunkTarget = { index: 0, token: 0 },
  t,
}: {
  diff: FileDiff;
  /** Enables expanding the unchanged gaps between hunks, which reads the
   * file from the working tree. Omitted by callers showing a *saved*
   * commit's diff (see `pendingVersions`), where the file on disk may no
   * longer match what that version recorded — there the gap markers stay
   * plain captions rather than offering lines that could be wrong. */
  projectPath?: string;
  viewMode?: DiffViewMode;
  hunkTarget?: { index: number; token: number };
  t: Translations;
}): React.JSX.Element {
  switch (diff.kind) {
    case "text": {
      const lineCount = diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
      return (
        <>
          {diff.truncated && (
            <p className="changes-diff__truncated" role="status">
              {t.changesDiffTruncatedNote(lineCount)}
            </p>
          )}
          <DiffHunkList
            hunks={diff.hunks}
            projectPath={projectPath}
            filePath={diff.path}
            viewMode={viewMode}
            hunkTarget={hunkTarget}
            t={t}
          />
        </>
      );
    }
    case "binary":
      return (
        <EmptyDiffNote
          icon={<FileQuestion aria-hidden="true" />}
          title={t.changesDiffBinaryTitle}
          description={t.changesDiffBinaryDescription}
        />
      );
    case "too-large":
      return (
        <EmptyDiffNote
          icon={<FileWarning aria-hidden="true" />}
          title={t.changesDiffTooLargeTitle}
          description={t.changesDiffTooLargeDescription(formatByteLimit(diff.limitBytes))}
        />
      );
    case "unchanged":
      return (
        <EmptyDiffNote
          icon={<Pencil aria-hidden="true" />}
          title={t.changesDiffUnchangedTitle}
          description={t.changesDiffUnchangedDescription}
        />
      );
    case "conflict":
      return (
        <>
          <EmptyDiffNote
            icon={<TriangleAlert aria-hidden="true" />}
            title={t.changesDiffConflictTitle}
            description={t.changesDiffConflictDescription}
            tone="attention"
          />
          {diff.detail === "unavailable" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictUnavailable}
            </p>
          )}
          {diff.detail === "binary" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictBinary}
            </p>
          )}
          {diff.detail === "too-large" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictTooLarge}
            </p>
          )}
          {diff.hunks.length > 0 && (
            <>
              {diff.truncated && (
                <p className="changes-diff__truncated" role="status">
                  {t.changesDiffTruncatedNote(diff.hunks.reduce((total, hunk) => total + hunk.lines.length, 0))}
                </p>
              )}
              <DiffHunkList
            hunks={diff.hunks}
            projectPath={projectPath}
            filePath={diff.path}
            viewMode={viewMode}
            hunkTarget={hunkTarget}
            t={t}
          />
            </>
          )}
        </>
      );
  }
}

const VIEW_MODE_LABEL_KEYS = {
  unified: "changesViewUnified",
  split: "changesViewSplit",
} as const satisfies Record<DiffViewMode, keyof Translations>;

/** The unified/split picker. Deliberately not a native `<select>`: an
 * appearance-stripped one renders its option list through the platform, which
 * ignores the app's theme and drops a light popup on top of the dark one. The
 * Overview branch picker already solved this the same way, so this reuses its
 * trigger (`.version-line-selector`) and popup (`.app-menu`) shapes — one
 * dropdown look across the app rather than a second, native-flavored one. */
function DiffViewSelector({
  value,
  onChange,
  t,
}: {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
  t: Translations;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Same dismissal contract as the Overview branch picker: focus moves into
  // the menu when it opens, Escape sends it back to the trigger, and a click
  // anywhere outside closes it.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => menuRef.current?.focus());
    const handlePointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <div className="changes-view-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="version-line-selector changes-view-picker__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t.changesViewAriaLabel} (${t[VIEW_MODE_LABEL_KEYS[value]]})`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {value === "split" ? (
          <Columns2 aria-hidden="true" className="version-line-selector__icon" />
        ) : (
          <Rows3 aria-hidden="true" className="version-line-selector__icon" />
        )}
        <span className="changes-view-picker__value">{t[VIEW_MODE_LABEL_KEYS[value]]}</span>
        <ChevronDown aria-hidden="true" className="version-line-selector__chevron" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="app-menu changes-view-picker__menu"
          role="menu"
          aria-label={t.changesViewAriaLabel}
          tabIndex={-1}
        >
          {(["unified", "split"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              className={`app-menu__item${value === mode ? " app-menu__item--selected" : ""}`}
              onClick={() => {
                setIsOpen(false);
                onChange(mode);
                triggerRef.current?.focus();
              }}
            >
              {mode === "split" ? <Columns2 aria-hidden="true" /> : <Rows3 aria-hidden="true" />}
              {t[VIEW_MODE_LABEL_KEYS[mode]]}
              {value === mode && <Check aria-hidden="true" className="app-menu__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** How many hunks the currently shown diff has. Only the two kinds that carry
 * hunks can be navigated; the rest have nothing to step through. */
function getHunkCount(diffState: DiffState): number {
  if (diffState.status !== "ready") {
    return 0;
  }
  const diff = diffState.diff;
  return diff.kind === "text" || diff.kind === "conflict" ? diff.hunks.length : 0;
}

function DiffWorkspace({
  projectPath,
  selectedPath,
  entry,
  diffState,
  filePosition,
  fileTotal,
  onSelectPreviousFile,
  onSelectNextFile,
  onRetry,
  onBackToList,
  t,
}: {
  projectPath: string;
  selectedPath: string | null;
  entry: WorkingTreeEntry | null;
  diffState: DiffState;
  /** 1-based, matching what the toolbar shows. `0` means the selected file
   * isn't in the (possibly filtered) list, which disables both arrows. */
  filePosition: number;
  fileTotal: number;
  onSelectPreviousFile: () => void;
  onSelectNextFile: () => void;
  onRetry: () => void;
  onBackToList: () => void;
  t: Translations;
}): React.JSX.Element {
  // Both live here rather than in `ChangesPanel` because they describe how
  // this pane is being read, not what the screen is showing: the view mode
  // deliberately survives moving between files, and the change target is
  // reset per file by the effect below.
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const hunkCount = getHunkCount(diffState);

  useEffect(() => {
    setHunkTarget({ index: 0, token: 0 });
  }, [selectedPath]);

  const goToHunk = (index: number): void => {
    setHunkTarget((current) => ({ index, token: current.token + 1 }));
  };

  if (!selectedPath) {
    // Only reachable transiently, between the list becoming empty and the
    // parent switching to the clean empty state.
    return <div className="changes-diff" />;
  }

  return (
    <div className="changes-diff" aria-label={t.changesDiffAriaLabel(selectedPath)}>
      <button type="button" className="changes-diff__back" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        {t.changesBackToList}
      </button>
      <header className="changes-diff__header">
        <span className="changes-diff__header-icon" aria-hidden="true">
          {entry ? CATEGORY_ICONS[entry.category] : null}
        </span>
        <div className="changes-diff__header-text">
          <div className="changes-diff__title-row">
            <p className="changes-diff__path">
              {selectedPath}
            </p>
            {entry && (
              <span className={`changes-diff__category changes-diff__category--${entry.category}`}>
                {t[CATEGORY_LABEL_KEYS[entry.category]]}
              </span>
            )}
            {/* Inline, not a second line: a line of its own grew this header
                past the height it shares with the file list's, putting the
                two panels' rules back out of step for exactly the renamed
                files this text appears on. It truncates like the path, with
                the full value on the tooltip. */}
            {entry?.originalPath && (
              <span className="changes-diff__origin" data-tooltip={t.changesRenamedFrom(entry.originalPath)}>
                {t.changesRenamedFrom(entry.originalPath)}
              </span>
            )}
          </div>
        </div>
        {fileTotal > 0 && (
          <div className="changes-diff__file-nav">
            {/* `0` means the open file is not in the list being shown — a
                search can narrow the list without changing the selection —
                and "File 0 of 3" is not a position. The arrows stay
                (disabled) so the control does not jump in and out while
                someone types. */}
            {filePosition > 0 && (
              <span className="changes-diff__position">{t.changesFilePosition(filePosition, fileTotal)}</span>
            )}
            <button
              type="button"
              className="changes-diff__step"
              aria-label={t.changesPreviousFile}
              data-tooltip={t.changesPreviousFile}
              disabled={filePosition <= 1}
              onClick={onSelectPreviousFile}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="changes-diff__step"
              aria-label={t.changesNextFile}
              data-tooltip={t.changesNextFile}
              disabled={filePosition === 0 || filePosition >= fileTotal}
              onClick={onSelectNextFile}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </header>
      {/* Paired with the file list's search strip: same height, same bottom
          rule, so the two panels keep reading as one grid. See the note on
          `--changes-toolbar-height` in styles.css. */}
      <div className="changes-diff__toolbar">
        <div className="changes-diff__view">
          <span className="changes-diff__view-label">{t.changesViewLabel}</span>
          <DiffViewSelector value={viewMode} onChange={setViewMode} t={t} />
        </div>
        {hunkCount > 0 && (
          <div className="changes-diff__hunk-nav">
            <span className="changes-diff__position">{t.changesHunkPosition(hunkTarget.index + 1, hunkCount)}</span>
            <button
              type="button"
              className="changes-diff__step"
              aria-label={t.changesPreviousHunk}
              data-tooltip={t.changesPreviousHunk}
              disabled={hunkTarget.index <= 0}
              onClick={() => goToHunk(hunkTarget.index - 1)}
            >
              <ArrowUp aria-hidden="true" />
            </button>
            <button
              type="button"
              className="changes-diff__step"
              aria-label={t.changesNextHunk}
              data-tooltip={t.changesNextHunk}
              disabled={hunkTarget.index >= hunkCount - 1}
              onClick={() => goToHunk(hunkTarget.index + 1)}
            >
              <ArrowDown aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="changes-diff__body auto-hide-scrollbar"
      >
        {diffState.status === "loading" && <LoadingBar label={t.changesDiffLoadingTitle} showLabel />}
        {diffState.status === "error" && (
          <div className="changes-diff__status changes-diff__status--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <p>{diffState.message}</p>
            <button type="button" className="secondary-button" onClick={onRetry}>
              {t.changesDiffRetry}
            </button>
          </div>
        )}
        {diffState.status === "ready" && (
          <DiffResultView
            diff={diffState.diff}
            projectPath={projectPath}
            viewMode={viewMode}
            hunkTarget={hunkTarget}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

function FileListItem({
  entry,
  isSelected,
  isIncluded,
  canChoose,
  onSelect,
  onToggleIncluded,
  t,
}: {
  entry: WorkingTreeEntry;
  isSelected: boolean;
  isIncluded: boolean;
  canChoose: boolean;
  onSelect: () => void;
  onToggleIncluded: () => void;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(entry.path);
  const categoryLabel = t[CATEGORY_LABEL_KEYS[entry.category]];
  const FileTypeIcon = getFileTypeIcon(entry.path);
  // The icon's shape (not just its color) already distinguishes the
  // category, so the label doesn't need to stay always-visible in a row that
  // is otherwise just a file name — it stays available as the accessible
  // name. Deliberately no tooltip: the row already shows the file name and
  // its folder, so one popping up on every row hover is pure noise.
  const accessibleName = entry.originalPath
    ? `${entry.path} — ${categoryLabel} — ${t.changesRenamedFrom(entry.originalPath)}`
    : `${entry.path} — ${categoryLabel}`;

  return (
    <li className="changes-file-row">
      <input
        className="changes-file-row__checkbox"
        type="checkbox"
        checked={isIncluded}
        disabled={!canChoose}
        aria-label={t.changesIncludeFile(entry.path)}
        onChange={onToggleIncluded}
      />
      <button
        type="button"
        className={`changes-file-item${isSelected ? " changes-file-item--active" : ""}${
          entry.category === "conflicted" ? " changes-file-item--attention" : ""
        }`}
        aria-current={isSelected ? "true" : undefined}
        aria-label={accessibleName}
        onClick={onSelect}
      >
        <span className="changes-file-item__icon" aria-hidden="true">
          <FileTypeIcon className="changes-file-item__type-icon" />
        </span>
        <span className="changes-file-item__details">
          <span className="changes-file-item__name">{name}</span>
          <span className="changes-file-item__dir">{dir || t.changesProjectRoot}</span>
          {entry.originalPath && (
            <span className="changes-file-item__origin">{t.changesRenamedFrom(entry.originalPath)}</span>
          )}
        </span>
        <span className={`changes-file-item__category-icon changes-file-item__category-icon--${entry.category}`} aria-hidden="true">
          {CATEGORY_ICONS[entry.category]}
        </span>
      </button>
    </li>
  );
}

export function ChangesPanel({
  projectPath,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  workingTreeCheckedAt,
  diffCache,
  onRefresh,
  onNavigateOverview,
  onPublishNow,
  selectedPath,
  onSelectedPathChange,
  isSaveVersionOpen,
  onOpenSaveVersion,
  onCloseSaveVersion,
  onSaveVersionPhaseChange,
}: {
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** When the last successful check landed, for the freshness note beside
   * the refresh button. `null` before the first one returns. */
  workingTreeCheckedAt: number | null;
  /** Owned by the caller, not this component, so already-read diffs survive
   * navigating away from Changes and back within the same project (see task
   * 019). Invalidation is unchanged: `getDiffStore` replaces the store
   * whenever the project or the working-tree snapshot changes. */
  diffCache: DiffCache;
  onRefresh: () => void;
  onNavigateOverview: () => void;
  onPublishNow: () => void;
  /** Which file is selected, lifted to the caller so it survives switching
   * away to another project's session and back (see task 012's per-session
   * UI state). `excludedPaths` (the save-version checkbox picks) stays local
   * below — it's a working selection for the *next* save, not something a
   * project session needs to remember across navigation. */
  selectedPath: string | null;
  onSelectedPathChange: (path: string | null) => void;
  isSaveVersionOpen: boolean;
  onOpenSaveVersion: () => void;
  onCloseSaveVersion: () => void;
  onSaveVersionPhaseChange: (
    phase: "planning" | "executing" | "error" | "success"
  ) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const entries = useMemo(() => (workingTree ? getOrderedChangeEntries(workingTree) : []), [workingTree]);
  const [announcement, setAnnouncement] = useState("");
  const [search, setSearch] = useState("");
  // The list the user is actually looking at. Selection, the save-version
  // checkboxes, and the totals all keep working off the full `entries`: a
  // search narrows what is *shown*, it does not silently drop files from the
  // version being saved.
  const visibleEntries = useMemo(() => filterEntriesBySearch(entries, search), [entries, search]);
  const store = getDiffStore(diffCache, projectPath, workingTree);
  // Seeded from the cache rather than starting at `idle`: on a remount with a
  // warm cache (navigating back to this screen) that difference is the one
  // frame of empty detail pane between mounting and the effect below running.
  const [diffState, setDiffState] = useState<DiffState>(() => {
    const cached = selectedPath ? store.cache.get(selectedPath) : undefined;
    return cached ? { status: "ready", diff: cached } : { status: "idle" };
  });
  const [retryToken, setRetryToken] = useState(0);
  // The diff cache is a plain Map that the batch prefetch mutates, so nothing
  // re-renders when it fills. Bumped once that batch lands, which is what
  // lets the subtitle's line totals appear.
  const [cacheVersion, setCacheVersion] = useState(0);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  // Below ~1024px the list and the diff can't sit side by side legibly, so
  // the layout becomes list/detail: this tracks which one is showing.
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  // Read inside the batch-prefetch effect's `.then`, so it reacts to
  // whichever file is selected *when the batch resolves* rather than
  // whichever was selected when the effect last ran.
  const selectedPathRef = useRef(selectedPath);
  selectedPathRef.current = selectedPath;
  // Lets the batch effect below tell "the store this call belongs to is still
  // the current one" from "a real project/snapshot switch happened while it
  // was in flight", now that the store is no longer this component's own ref.
  const storeRef = useRef(store);
  storeRef.current = store;

  // Preserves the current selection across a refresh when it is still
  // present; otherwise moves to the next available file and announces the
  // material change without stealing focus.
  useEffect(() => {
    const resolved = resolveSelectedPath(entries, selectedPath);
    if (resolved === selectedPath) {
      return;
    }
    onSelectedPathChange(resolved);
    if (resolved) {
      setAnnouncement(t.changesSelectionAnnouncement(resolved));
    }
  }, [entries, selectedPath, t, onSelectedPathChange]);

  // Local to this project's session: a switch away and back (or the working
  // tree simply refreshing) must not leave a previous project's checkbox
  // exclusions applied to a different one's file list.
  useEffect(() => {
    setExcludedPaths(new Set());
    setSearch("");
  }, [projectPath]);

  useEffect(() => {
    const available = new Set(entries.map((entry) => entry.path));
    setExcludedPaths((current) => {
      const next = new Set([...current].filter((path) => available.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  // Diffs are cached only for the current working-tree snapshot. A refresh or
  // project switch replaces the whole store, while revisiting a file within
  // the same snapshot is instant — including after leaving this screen and
  // coming back, since the store outlives the component. In-flight requests
  // are shared too, avoiding duplicate Git processes when the user switches
  // away and back quickly.
  useEffect(() => {
    if (!selectedPath) {
      setDiffState({ status: "idle" });
      return undefined;
    }

    const cachedDiff = store.cache.get(selectedPath);
    if (cachedDiff) {
      setDiffState({ status: "ready", diff: cachedDiff });
      return undefined;
    }

    let cancelled = false;
    setDiffState({ status: "idle" });
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setDiffState({ status: "loading" });
      }
    }, DIFF_LOADING_DELAY_MS);

    fetchDiff(store, projectPath, selectedPath)
      .then((diff) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "ready", diff });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "error", message: localizeAppError(error, t, t.changesDiffErrorTitle) });
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [store, projectPath, selectedPath, workingTree, retryToken, t]);

  // Warms the entire cache in one Git process per working-tree snapshot
  // (`read_working_tree_diffs`), instead of one process per file
  // (`read_file_diff`) — the dominant cost of switching between files
  // quickly. Best-effort and additive: a path this doesn't cover (a
  // conflict, an oversized section, or the call failing outright) simply
  // falls back to the on-demand fetch above, so this can never make things
  // worse, only faster. `selectedPathRef` reads whichever file is current
  // *when the batch resolves*, not whichever was selected when the effect
  // started, so a same-tick reselection is still handled correctly.
  useEffect(() => {
    if (!workingTree || workingTree.isClean) {
      return undefined;
    }
    if (store.batchStarted) {
      return undefined;
    }
    store.batchStarted = true;
    invoke<FileDiff[]>("read_working_tree_diffs", { path: projectPath })
      .then((diffs) => {
        // Guards against a real project/snapshot switch that happened while
        // this was in flight — deliberately *not* an effect-cleanup
        // `cancelled` flag. Combined with the one-shot `batchStarted` guard
        // above, that pattern breaks under React's development StrictMode:
        // its synchronous mount → cleanup → mount would cancel this exact
        // call, and the guard would then block the second mount from ever
        // starting a real replacement, permanently discarding the result.
        // Comparing store identity survives that double-invoke correctly
        // while still discarding a result that genuinely no longer applies.
        if (storeRef.current !== store) {
          return;
        }
        for (const diff of diffs) {
          if (!store.cache.has(diff.path)) {
            store.cache.set(diff.path, diff);
          }
          if (diff.path === selectedPathRef.current) {
            setDiffState({ status: "ready", diff });
          }
        }
        setCacheVersion((version) => version + 1);
      })
      .catch(() => {
        // Silent: a best-effort cache warm-up, not the file the user is
        // actually looking at. Its own fetch (above) reports real errors.
      });
  }, [store, projectPath, workingTree]);

  // Quietly warms the cache for files near the current selection, so the
  // common "review sequentially, click next" flow finds a warm cache instead
  // of paying a fresh Git process spawn on every click. Never touches
  // `diffState`: a slow or failed prefetch is invisible unless the user
  // actually selects that file, at which point the effect above handles it
  // (and reports the error) normally.
  useEffect(() => {
    if (!selectedPath) {
      return;
    }
    const index = entries.findIndex((entry) => entry.path === selectedPath);
    if (index === -1) {
      return;
    }
    for (let offset = 1; offset <= PREFETCH_RADIUS; offset += 1) {
      for (const neighbor of [entries[index - offset], entries[index + offset]]) {
        if (neighbor && !store.cache.has(neighbor.path) && !store.requests.has(neighbor.path)) {
          fetchDiff(store, projectPath, neighbor.path).catch(() => {
            // Silent: this path isn't visible to the user yet.
          });
        }
      }
    }
  }, [store, entries, projectPath, selectedPath]);

  const isLoadingList = isCheckingChanges && !workingTree;
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null;
  const canChooseFiles = !workingTree?.truncated;
  const includedPaths = useMemo(
    () => entries.filter((entry) => !excludedPaths.has(entry.path)).map((entry) => entry.path),
    [entries, excludedPaths],
  );
  const selectedPathsForSave = canChooseFiles ? includedPaths : null;
  const includedCount = canChooseFiles ? includedPaths.length : (workingTree?.counts.total ?? 0);
  const canSaveSelection = includedCount > 0;
  const totalCount = workingTree?.counts.total ?? 0;
  const allSelected = totalCount > 0 && includedCount === totalCount;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = includedCount > 0 && includedCount < totalCount;
    }
  }, [includedCount, totalCount]);

  // `cacheVersion` is the dependency that matters here — `store.cache` is a
  // mutable Map whose identity never changes as the batch fills it.
  const lineTotals = useMemo(() => sumCachedDiffLines(entries, store.cache), [entries, store, cacheVersion]);

  // File-to-file navigation walks the list the user can actually see, so
  // "next file" during a search means the next match, not the next file
  // hidden behind the filter.
  const visibleIndex = visibleEntries.findIndex((entry) => entry.path === selectedPath);
  const selectFileAt = (index: number): void => {
    const next = visibleEntries[index];
    if (next) {
      onSelectedPathChange(next.path);
    }
  };

  let headerMessage: React.ReactNode = null;
  if (isLoadingList) {
    headerMessage = <p>{t.statusCheckingMessage}</p>;
  } else if (!workingTree && workingTreeError) {
    headerMessage = (
      <p role="alert" className="changes-header__error">
        {workingTreeError}
      </p>
    );
  } else if (workingTree) {
    const { conflicted, total } = workingTree.counts;
    headerMessage = (
      <p className="changes-view__summary">
        <span>
          {workingTree.isClean
            ? t.changesSummaryClean
            : conflicted > 0
              ? t.changesSummaryWithConflicts(conflicted, total)
              : t.changesSummaryTotal(total)}
        </span>
        {!workingTree.isClean && lineTotals && (
          <>
            <span className="changes-view__summary-separator" aria-hidden="true">
              ·
            </span>
            <span className="changes-view__line-totals">
              <span className="changes-view__lines changes-view__lines--added">
                <span aria-hidden="true">{t.changesLinesAddedTotal(lineTotals.added)}</span>
                <span className="visually-hidden">{t.changesLinesAddedTotalAriaLabel(lineTotals.added)}</span>
              </span>
              <span className="changes-view__lines changes-view__lines--removed">
                <span aria-hidden="true">{t.changesLinesRemovedTotal(lineTotals.removed)}</span>
                <span className="visually-hidden">{t.changesLinesRemovedTotalAriaLabel(lineTotals.removed)}</span>
              </span>
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <div className="changes-view" aria-busy={isCheckingChanges}>
      <header className="changes-view__header">
        <div>
          <h1>{t.changesHeading}</h1>
          {headerMessage}
          {workingTree && workingTreeError && !isCheckingChanges && (
            <p className="changes-header__note" role="alert">
              {t.statusRefreshFailedNote}
            </p>
          )}
        </div>
        <div className="changes-view__actions">
          {/* The button says only "Refresh" here, unlike Overview's fuller
              "Check for changes": the note beside it already establishes that
              checking is what just happened, so the verb alone is enough. */}
          <CheckFreshnessNote checkedAt={workingTreeCheckedAt} isChecking={isCheckingChanges} t={t} />
          {/* The two buttons are one group; the freshness note beside them is
              status text, not a third action, so it sits further out. */}
          <div className="changes-view__buttons">
            <button
              className="secondary-button changes-view__refresh"
              type="button"
              onClick={onRefresh}
              disabled={isCheckingChanges}
            >
              <RefreshCw aria-hidden="true" className={isCheckingChanges ? "icon--spinning" : undefined} />
              {t.changesRefresh}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={onOpenSaveVersion}
              disabled={!workingTree || workingTree.isClean || isCheckingChanges || !canSaveSelection}
              data-tooltip={
                !workingTree || workingTree.isClean
                  ? t.changesSaveVersionDisabledHint
                  : !canSaveSelection
                    ? t.changesSaveVersionNoSelectionHint
                    : undefined
              }
            >
              <Save aria-hidden="true" />
              {/* Names what it will actually save. Without a per-file choice
                (a truncated status) there is no selection to count, so it
                falls back to the plain label. */}
              {canChooseFiles && canSaveSelection ? t.changesSaveSelected(includedCount) : t.changesSaveVersion}
            </button>
          </div>
        </div>
      </header>

      {isLoadingList ? (
        <LoadingBar label={t.commonLoading} />
      ) : !workingTree ? null : workingTree.isClean ? (
        <div className="changes-empty">
          <div className="changes-empty__icon" aria-hidden="true">
            <CheckCircle2 />
          </div>
          <h2>{t.changesEmptyTitle}</h2>
          <p>{t.changesEmptyDescription}</p>
          <button className="secondary-button" type="button" onClick={onNavigateOverview}>
            {t.changesBackToOverview}
          </button>
        </div>
      ) : (
        <div className={`changes-layout${isDetailFocused ? " changes-layout--detail" : ""}`}>
          <nav className="changes-file-list" aria-label={t.changesListAriaLabel}>
            <div className="changes-file-list__selection">
              <span className="changes-file-list__select-all">
                {canChooseFiles ? (
                  <input
                    ref={selectAllRef}
                    className="changes-file-row__checkbox"
                    type="checkbox"
                    checked={allSelected}
                    aria-label={allSelected ? t.changesSelectNone : t.changesSelectAll}
                    onChange={() =>
                      allSelected
                        ? setExcludedPaths(new Set(entries.map((entry) => entry.path)))
                        : setExcludedPaths(new Set())
                    }
                  />
                ) : (
                  <input
                    className="changes-file-row__checkbox"
                    type="checkbox"
                    checked
                    disabled
                    aria-label={t.changesPartialUnavailableTruncated}
                    data-tooltip={t.changesPartialUnavailableTruncated}
                    readOnly
                  />
                )}
              </span>
              <span>{t.changesSelectionSummary(includedCount, workingTree.counts.total)}</span>
            </div>
            {/* Paired with `.changes-diff__toolbar` — see the note on
                `--changes-toolbar-height` in styles.css. */}
            <div className="changes-file-list__search">
              <label className="changes-search-box">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.changesSearchPlaceholder}
                  aria-label={t.changesSearchAriaLabel}
                />
              </label>
            </div>
            <div
              {...autoHideScrollbarProps<HTMLDivElement>()}
              className="changes-file-list__scroll auto-hide-scrollbar"
            >
              {workingTree.truncated && (
                <p className="changes-file-list__truncated" role="status">
                  {t.statusTruncatedNote(entries.length)}
                </p>
              )}
              {visibleEntries.length === 0 && (
                <p className="changes-file-list__empty" role="status">
                  {t.changesNoSearchMatches}
                </p>
              )}
              <ul>
                {visibleEntries.map((entry) => (
                  <FileListItem
                    key={entry.path}
                    entry={entry}
                    isSelected={entry.path === selectedPath}
                    isIncluded={!excludedPaths.has(entry.path)}
                    canChoose={canChooseFiles}
                    onSelect={() => {
                      onSelectedPathChange(entry.path);
                      setIsDetailFocused(true);
                    }}
                    onToggleIncluded={() =>
                      setExcludedPaths((current) => {
                        const next = new Set(current);
                        if (next.has(entry.path)) {
                          next.delete(entry.path);
                        } else {
                          next.add(entry.path);
                        }
                        return next;
                      })
                    }
                    t={t}
                  />
                ))}
              </ul>
            </div>
          </nav>
          <DiffWorkspace
            projectPath={projectPath}
            selectedPath={selectedPath}
            entry={selectedEntry}
            diffState={diffState}
            filePosition={visibleIndex + 1}
            fileTotal={visibleEntries.length}
            onSelectPreviousFile={() => selectFileAt(visibleIndex - 1)}
            onSelectNextFile={() => selectFileAt(visibleIndex + 1)}
            onRetry={() => setRetryToken((token) => token + 1)}
            onBackToList={() => setIsDetailFocused(false)}
            t={t}
          />
        </div>
      )}

      <span className="visually-hidden" role="status">
        {announcement}
      </span>

      <SaveVersionDialog
        isOpen={isSaveVersionOpen}
        projectPath={projectPath}
        selectedPaths={selectedPathsForSave}
        onClose={onCloseSaveVersion}
        onSaved={onRefresh}
        onPublishNow={onPublishNow}
        onPhaseChange={onSaveVersionPhaseChange}
      />
    </div>
  );
}
