import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsUpDown, FileQuestion, FileWarning, Pencil, TriangleAlert } from "lucide-react";

import type { Translations } from "../../i18n";
import { autoHideScrollbarProps } from "../../shared/ui";
import type { DiffHunk, DiffLine, FileDiff } from "./domain";

type HighlightLine = (line: string) => React.ReactNode;

function useSyntaxHighlight(filePath: string): HighlightLine | null {
  const [highlight, setHighlight] = useState<HighlightLine | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHighlight(null);
    void import("./syntaxHighlight").then((module) => {
      const language = module.detectSyntaxLanguage(filePath);
      if (!cancelled && language) {
        setHighlight(() => (line: string) => module.highlightSyntaxLine(line, language));
      }
    }).catch(() => {
      // Progressive enhancement: readable plain text is already rendered.
    });
    return () => { cancelled = true; };
  }, [filePath]);
  return highlight;
}

function formatByteLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}
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

function DiffLineRow({ line, highlight, t }: { line: DiffLine; highlight: HighlightLine | null; t: Translations }): React.JSX.Element {
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
      <span className="diff-line__content">{highlight ? highlight(line.content) : line.content}</span>
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

type VisualDiffViewMode = "unified" | "split";
export type DiffViewMode = VisualDiffViewMode | "accessible";

/** Plain-text representation of every loaded diff row. Unlike the visual
 * virtualizer, this is one complete document, so assistive technology,
 * find-in-page and ordinary text selection can reach the whole diff. */
export function formatDiffAsAccessibleText(hunks: DiffHunk[]): string {
  return hunks
    .map((hunk) => [
      hunk.header,
      ...hunk.lines.map((line) => `${line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}${line.content}`),
    ].join("\n"))
    .join("\n\n");
}

function AccessibleDiffText({ hunks, t }: { hunks: DiffHunk[]; t: Translations }): React.JSX.Element {
  return (
    <pre
      {...autoHideScrollbarProps<HTMLPreElement>()}
      className="diff-code diff-code--accessible auto-hide-scrollbar"
      tabIndex={0}
      aria-label={t.changesViewAccessibleAriaLabel}
    >
      <code>{formatDiffAsAccessibleText(hunks)}</code>
    </pre>
  );
}

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
  highlight,
  t,
}: {
  line: DiffLine | null;
  side: "old" | "new";
  highlight: HighlightLine | null;
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
        <span className="diff-line__content">{highlight ? highlight(line.content) : line.content}</span>
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
  sessionEpoch,
  readFileLines,
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
  sessionEpoch?: string;
  readFileLines?: (filePath: string, startLine: number, endLine: number) => Promise<{ startLine: number; lines: string[]; truncated: boolean }>;
  filePath: string;
  viewMode: VisualDiffViewMode;
  /** The hunk the toolbar last navigated to. `token` (rather than the index
   * alone) is what makes a repeated press of the same button scroll again
   * instead of silently doing nothing because the index did not change. */
  hunkTarget: { index: number; token: number };
  t: Translations;
}): React.JSX.Element {
  const highlight = useSyntaxHighlight(filePath);
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
    if (projectPath === undefined || !sessionEpoch || !readFileLines || expandingHunk !== null) {
      return;
    }
    const requestedPath = filePath;
    const alreadyLoaded = expansions[hunkIndex]?.lines.length ?? 0;
    setExpandingHunk(hunkIndex);
    setExpandError(null);
    readFileLines(requestedPath, gap.newStart + alreadyLoaded, gap.newStart + gap.hiddenLines - 1)
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
                <DiffLineRow line={row.line} highlight={highlight} t={t} />
              ) : (
                <div className="diff-split-row">
                  <DiffSplitCell line={row.left} side="old" highlight={highlight} t={t} />
                  <DiffSplitCell line={row.right} side="new" highlight={highlight} t={t} />
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
  sessionEpoch,
  readFileLines,
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
  sessionEpoch?: string;
  readFileLines?: (filePath: string, startLine: number, endLine: number) => Promise<{ startLine: number; lines: string[]; truncated: boolean }>;
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
          {viewMode === "accessible" ? (
            <AccessibleDiffText hunks={diff.hunks} t={t} />
          ) : (
            <DiffHunkList
              hunks={diff.hunks}
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              readFileLines={readFileLines}
              filePath={diff.path}
              viewMode={viewMode}
              hunkTarget={hunkTarget}
              t={t}
            />
          )}
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
              {viewMode === "accessible" ? (
                <AccessibleDiffText hunks={diff.hunks} t={t} />
              ) : (
                <DiffHunkList
                  hunks={diff.hunks}
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  readFileLines={readFileLines}
                  filePath={diff.path}
                  viewMode={viewMode}
                  hunkTarget={hunkTarget}
                  t={t}
                />
              )}
            </>
          )}
        </>
      );
  }
}
