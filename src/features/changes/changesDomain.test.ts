import { describe, expect, it } from "vitest";
import {
  buildSplitRows,
  estimateLineRows,
  flattenDiffRows,
  formatDiffAsAccessibleText,
  gapBeforeHunk,
  getHunkStartRows,
  isFirstRowOfHunk,
  measureDiffRowHeight,
} from "./DiffResultView";
import {
  countDiffLines,
  filterEntriesBySearch,
  getCheckFreshness,
  getOrderedChangeEntries,
  resolveSelectedPath,
  sumCachedDiffLines,
} from "./ChangesPanel";
import type { DiffHunk, DiffLine, FileDiff } from "./index";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "../status";

function entry(path: string, category: ChangeCategory, originalPath: string | null = null): WorkingTreeEntry {
  return { path, originalPath, category, isPrepared: false, hasUnpreparedChanges: true };
}

function status(entries: WorkingTreeEntry[], truncated = false): WorkingTreeStatus {
  return {
    isClean: entries.length === 0,
    counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: entries.length },
    entries,
    truncated,
    hasPreparedChanges: false,
    hasUnpreparedChanges: entries.length > 0,
    upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
  };
}

describe("getOrderedChangeEntries", () => {
  it("puts conflicted files first regardless of their original position", () => {
    const entries = [entry("a.txt", "changed"), entry("b.txt", "conflicted"), entry("c.txt", "new")];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual(["b.txt", "a.txt", "c.txt"]);
  });

  it("keeps a stable, documented order across every category", () => {
    const entries = [
      entry("renamed.txt", "renamed", "old.txt"),
      entry("deleted.txt", "deleted"),
      entry("new.txt", "new"),
      entry("conflicted.txt", "conflicted"),
      entry("changed.txt", "changed"),
    ];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual([
      "conflicted.txt",
      "changed.txt",
      "new.txt",
      "deleted.txt",
      "renamed.txt",
    ]);
  });

  it("preserves the original relative order of entries within the same category", () => {
    const entries = [entry("b.txt", "changed"), entry("a.txt", "changed")];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual(["b.txt", "a.txt"]);
  });

  it("does not mutate the status entries array", () => {
    const entries = [entry("b.txt", "new"), entry("a.txt", "conflicted")];
    const original = status(entries);

    getOrderedChangeEntries(original);

    expect(original.entries).toEqual(entries);
  });
});

describe("resolveSelectedPath", () => {
  const entries = [entry("a.txt", "changed"), entry("b.txt", "new")];

  it("selects the first entry when there is no previous selection", () => {
    expect(resolveSelectedPath(entries, null)).toBe("a.txt");
  });

  it("preserves the previous selection when it is still present", () => {
    expect(resolveSelectedPath(entries, "b.txt")).toBe("b.txt");
  });

  it("falls back to the first entry when the previous selection has disappeared", () => {
    expect(resolveSelectedPath(entries, "gone.txt")).toBe("a.txt");
  });

  it("returns null when the list is empty", () => {
    expect(resolveSelectedPath([], "a.txt")).toBeNull();
  });
});

function line(kind: DiffLine["kind"], content: string): DiffLine {
  return { kind, content, oldLineNumber: null, newLineNumber: null };
}

function hunk(oldStart: number, oldLines: number, lines: DiffLine[]): DiffHunk {
  return { header: `@@ -${oldStart},${oldLines} +${oldStart},${lines.length} @@`, oldStart, oldLines, newStart: oldStart, newLines: lines.length, lines };
}

describe("flattenDiffRows", () => {
  it("emits one line row per hunk line, with no marker for the first hunk at the start of the file", () => {
    const hunks = [hunk(1, 1, [line("context", "a"), line("addition", "b")])];

    const rows = flattenDiffRows(hunks);

    expect(rows).toEqual([
      { kind: "line", hunkIndex: 0, line: hunks[0].lines[0] },
      { kind: "line", hunkIndex: 0, line: hunks[0].lines[1] },
    ]);
  });

  it("inserts a marker row when a later hunk skips unchanged lines", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(10, 1, [line("context", "b")])];

    const rows = flattenDiffRows(hunks);

    expect(rows).toEqual([
      { kind: "line", hunkIndex: 0, line: hunks[0].lines[0] },
      { kind: "marker", hunkIndex: 1, hiddenLines: 8, gap: { hiddenLines: 8, oldStart: 2, newStart: 2 } },
      { kind: "line", hunkIndex: 1, line: hunks[1].lines[0] },
    ]);
  });

  it("emits no marker when hunks are adjacent with nothing hidden between them", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(2, 1, [line("context", "b")])];

    expect(flattenDiffRows(hunks).map((row) => row.kind)).toEqual(["line", "line"]);
  });
});

describe("formatDiffAsAccessibleText", () => {
  it("includes every hunk and line in one selectable document", () => {
    const hunks: DiffHunk[] = [
      {
        header: "@@ -1,2 +1,2 @@",
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        lines: [
          { kind: "deletion", content: "before", oldLineNumber: 1, newLineNumber: null },
          { kind: "addition", content: "after", oldLineNumber: null, newLineNumber: 1 },
        ],
      },
      {
        header: "@@ -8,1 +8,1 @@",
        oldStart: 8,
        oldLines: 1,
        newStart: 8,
        newLines: 1,
        lines: [{ kind: "context", content: "kept", oldLineNumber: 8, newLineNumber: 8 }],
      },
    ];

    expect(formatDiffAsAccessibleText(hunks)).toBe(
      "@@ -1,2 +1,2 @@\n-before\n+after\n\n@@ -8,1 +8,1 @@\n kept",
    );
  });
});

describe("filterEntriesBySearch", () => {
  const entries = [entry("src/main.tsx", "changed"), entry("docs/README.md", "new"), entry("src/Styles.css", "changed")];

  it("returns every entry for an empty or whitespace-only query", () => {
    expect(filterEntriesBySearch(entries, "")).toEqual(entries);
    expect(filterEntriesBySearch(entries, "   ")).toEqual(entries);
  });

  it("matches anywhere in the path, ignoring case", () => {
    expect(filterEntriesBySearch(entries, "SRC/").map((item) => item.path)).toEqual([
      "src/main.tsx",
      "src/Styles.css",
    ]);
    expect(filterEntriesBySearch(entries, "styles").map((item) => item.path)).toEqual(["src/Styles.css"]);
  });

  it("returns nothing when no path matches", () => {
    expect(filterEntriesBySearch(entries, "nothing-here")).toEqual([]);
  });
});

function textDiff(path: string, hunks: DiffHunk[]): FileDiff {
  return { kind: "text", path, originalPath: null, change: "changed", hunks, truncated: false };
}

describe("countDiffLines", () => {
  it("counts additions and deletions, ignoring context lines", () => {
    const diff = textDiff("a.txt", [
      hunk(1, 2, [line("context", "keep"), line("addition", "new"), line("deletion", "old"), line("addition", "new2")]),
    ]);

    expect(countDiffLines(diff)).toEqual({ added: 2, removed: 1 });
  });

  it("reports zero for kinds whose contents were never read", () => {
    const binary: FileDiff = { kind: "binary", path: "logo.png", originalPath: null, change: "changed" };
    expect(countDiffLines(binary)).toEqual({ added: 0, removed: 0 });
  });
});

describe("sumCachedDiffLines", () => {
  const entries = [entry("a.txt", "changed"), entry("b.txt", "changed")];

  it("sums every file once the whole snapshot is cached", () => {
    const cache = new Map<string, FileDiff>([
      ["a.txt", textDiff("a.txt", [hunk(1, 1, [line("addition", "x")])])],
      ["b.txt", textDiff("b.txt", [hunk(1, 1, [line("deletion", "y"), line("addition", "z")])])],
    ]);

    expect(sumCachedDiffLines(entries, cache)).toEqual({ added: 2, removed: 1 });
  });

  it("returns null while any file is still missing, rather than a partial total", () => {
    const cache = new Map<string, FileDiff>([["a.txt", textDiff("a.txt", [hunk(1, 1, [line("addition", "x")])])]]);

    expect(sumCachedDiffLines(entries, cache)).toBeNull();
  });

  it("returns null for an empty change set", () => {
    expect(sumCachedDiffLines([], new Map())).toBeNull();
  });

  it("returns null when a file's own count would only be a floor", () => {
    const truncated: FileDiff = {
      kind: "text",
      path: "b.txt",
      originalPath: null,
      change: "changed",
      hunks: [hunk(1, 1, [line("addition", "y")])],
      truncated: true,
    };
    const withTruncated = new Map<string, FileDiff>([
      ["a.txt", textDiff("a.txt", [hunk(1, 1, [line("addition", "x")])])],
      ["b.txt", truncated],
    ]);
    expect(sumCachedDiffLines(entries, withTruncated)).toBeNull();

    const tooLarge: FileDiff = {
      kind: "too-large",
      path: "b.txt",
      originalPath: null,
      change: "changed",
      limitBytes: 1024,
    };
    const withTooLarge = new Map<string, FileDiff>([
      ["a.txt", textDiff("a.txt", [hunk(1, 1, [line("addition", "x")])])],
      ["b.txt", tooLarge],
    ]);
    expect(sumCachedDiffLines(entries, withTooLarge)).toBeNull();
  });

  it("still counts files that genuinely contribute no lines", () => {
    const binary: FileDiff = { kind: "binary", path: "b.txt", originalPath: null, change: "changed" };
    const cache = new Map<string, FileDiff>([
      ["a.txt", textDiff("a.txt", [hunk(1, 1, [line("addition", "x")])])],
      ["b.txt", binary],
    ]);

    expect(sumCachedDiffLines(entries, cache)).toEqual({ added: 1, removed: 0 });
  });
});

describe("gapBeforeHunk", () => {
  it("measures the gap from the end of the previous hunk in both coordinate systems", () => {
    // The first hunk adds a line, so everything after it sits one line later
    // on the new side than on the old one.
    const first = { ...hunk(1, 2, [line("context", "a"), line("addition", "b")]), newStart: 1, newLines: 3 };
    const second = hunk(10, 1, [line("context", "c")]);

    expect(gapBeforeHunk(second, first)).toEqual({ hiddenLines: 7, oldStart: 3, newStart: 4 });
  });

  it("measures from line 1 for the first hunk", () => {
    expect(gapBeforeHunk(hunk(5, 1, [line("context", "a")]), null)).toEqual({
      hiddenLines: 4,
      oldStart: 1,
      newStart: 1,
    });
  });
});

describe("flattenDiffRows with expanded gaps", () => {
  const hunks = [hunk(1, 1, [line("context", "a")]), hunk(10, 1, [line("context", "b")])];

  it("turns fetched gap lines into ordinary context rows, numbered from the gap's start", () => {
    const rows = flattenDiffRows(hunks, { 1: { lines: ["two", "three"] } });

    expect(rows[1]).toEqual({
      kind: "line",
      hunkIndex: 1,
      line: { kind: "context", content: "two", oldLineNumber: 2, newLineNumber: 2 },
    });
    expect(rows[2]).toEqual({
      kind: "line",
      hunkIndex: 1,
      line: { kind: "context", content: "three", oldLineNumber: 3, newLineNumber: 3 },
    });
  });

  it("keeps a marker for the part of the gap still unfetched", () => {
    const rows = flattenDiffRows(hunks, { 1: { lines: ["two", "three"] } });
    const marker = rows.find((row) => row.kind === "marker");

    // 8 hidden, 2 pulled in, 6 to go — so the gap stays openable.
    expect(marker).toMatchObject({ kind: "marker", hiddenLines: 6 });
  });

  it("drops the marker once the whole gap has been fetched", () => {
    const rows = flattenDiffRows(hunks, {
      1: { lines: ["2", "3", "4", "5", "6", "7", "8", "9"] },
    });

    expect(rows.some((row) => row.kind === "marker")).toBe(false);
  });
});

describe("buildSplitRows with expanded gaps", () => {
  it("fills both columns with each expanded line, since it is unchanged", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(10, 1, [line("context", "b")])];

    const rows = buildSplitRows(hunks, { 1: { lines: ["two"] } });
    const expanded = rows[1];

    expect(expanded).toEqual({
      kind: "pair",
      hunkIndex: 1,
      left: { kind: "context", content: "two", oldLineNumber: 2, newLineNumber: 2 },
      right: { kind: "context", content: "two", oldLineNumber: 2, newLineNumber: 2 },
    });
  });
});

describe("getCheckFreshness", () => {
  const now = 1_700_000_000_000;

  it("calls anything under a minute 'just now'", () => {
    expect(getCheckFreshness(now, now)).toEqual({ unit: "now" });
    expect(getCheckFreshness(now - 59_000, now)).toEqual({ unit: "now" });
  });

  it("counts whole minutes, then whole hours", () => {
    expect(getCheckFreshness(now - 60_000, now)).toEqual({ unit: "minutes", value: 1 });
    expect(getCheckFreshness(now - 59 * 60_000, now)).toEqual({ unit: "minutes", value: 59 });
    expect(getCheckFreshness(now - 60 * 60_000, now)).toEqual({ unit: "hours", value: 1 });
    expect(getCheckFreshness(now - 23 * 60 * 60_000, now)).toEqual({ unit: "hours", value: 23 });
  });

  it("stops counting past a day", () => {
    expect(getCheckFreshness(now - 24 * 60 * 60_000, now)).toEqual({ unit: "long-ago" });
  });

  it("treats a clock that jumped backwards as 'just now' rather than a negative age", () => {
    expect(getCheckFreshness(now + 5_000, now)).toEqual({ unit: "now" });
  });
});

describe("buildSplitRows", () => {
  it("shows a context line in both columns", () => {
    const hunks = [hunk(1, 1, [line("context", "a")])];

    expect(buildSplitRows(hunks)).toEqual([
      { kind: "pair", hunkIndex: 0, left: hunks[0].lines[0], right: hunks[0].lines[0] },
    ]);
  });

  it("pairs a run of deletions with the additions that replaced them", () => {
    const lines = [line("deletion", "old1"), line("deletion", "old2"), line("addition", "new1"), line("addition", "new2")];
    const hunks = [hunk(1, 2, lines)];

    expect(buildSplitRows(hunks)).toEqual([
      { kind: "pair", hunkIndex: 0, left: lines[0], right: lines[2] },
      { kind: "pair", hunkIndex: 0, left: lines[1], right: lines[3] },
    ]);
  });

  it("leaves the shorter side empty when a run is unbalanced", () => {
    const lines = [line("deletion", "old1"), line("deletion", "old2"), line("addition", "new1")];
    const hunks = [hunk(1, 2, lines)];

    expect(buildSplitRows(hunks)).toEqual([
      { kind: "pair", hunkIndex: 0, left: lines[0], right: lines[2] },
      { kind: "pair", hunkIndex: 0, left: lines[1], right: null },
    ]);
  });

  it("does not pair across a context line", () => {
    const lines = [line("deletion", "old"), line("context", "keep"), line("addition", "new")];
    const hunks = [hunk(1, 3, lines)];

    expect(buildSplitRows(hunks)).toEqual([
      { kind: "pair", hunkIndex: 0, left: lines[0], right: null },
      { kind: "pair", hunkIndex: 0, left: lines[1], right: lines[1] },
      { kind: "pair", hunkIndex: 0, left: null, right: lines[2] },
    ]);
  });

  it("keeps the unchanged-lines marker between hunks", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(10, 1, [line("context", "b")])];

    expect(buildSplitRows(hunks).map((row) => row.kind)).toEqual(["pair", "marker", "pair"]);
  });
});

describe("getHunkStartRows", () => {
  it("points at each hunk's first row, marker included", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(10, 2, [line("context", "b"), line("addition", "c")])];
    const rows = flattenDiffRows(hunks);

    // [0] line (hunk 0), [1] marker (hunk 1), [2] line, [3] line
    expect(getHunkStartRows(rows, hunks.length)).toEqual([0, 1]);
  });

  it("reports -1 for a hunk with no rows at all", () => {
    expect(getHunkStartRows([], 2)).toEqual([-1, -1]);
  });
});

describe("isFirstRowOfHunk", () => {
  it("is true for the very first row", () => {
    const rows = flattenDiffRows([hunk(1, 1, [line("context", "a")])]);
    expect(isFirstRowOfHunk(rows, 0)).toBe(true);
  });

  it("is true for a marker or line that starts a new hunk, and false otherwise", () => {
    const hunks = [hunk(1, 2, [line("context", "a"), line("context", "b")]), hunk(10, 1, [line("context", "c")])];
    const rows = flattenDiffRows(hunks);

    // [line(hunk0), line(hunk0), marker(hunk1), line(hunk1)]
    expect(rows.map((_, index) => isFirstRowOfHunk(rows, index))).toEqual([true, false, true, false]);
  });
});

/** `.diff-line__content` is `white-space: pre-wrap` with `overflow-wrap:
 * anywhere`, so a long line occupies several visual lines. The virtualizer
 * used to assume one line always meant one row's worth of height, which put
 * every row below a wrapped one at the wrong offset until it was measured. */
describe("estimateLineRows", () => {
  it("keeps a line that fits on one row at one row", () => {
    expect(estimateLineRows("x".repeat(40), 80)).toBe(1);
    expect(estimateLineRows("x".repeat(80), 80)).toBe(1);
  });

  it("counts the extra rows a wrapped line takes", () => {
    expect(estimateLineRows("x".repeat(81), 80)).toBe(2);
    expect(estimateLineRows("x".repeat(160), 80)).toBe(2);
    expect(estimateLineRows("x".repeat(161), 80)).toBe(3);
  });

  it("never collapses an empty line to zero height", () => {
    expect(estimateLineRows("", 80)).toBe(1);
  });

  it("falls back to a single row before the width has been measured", () => {
    expect(estimateLineRows("x".repeat(500), 0)).toBe(1);
  });

  it("expands tabs to the next tab stop instead of counting them as one character", () => {
    expect(estimateLineRows("1234\t9", 8, 8)).toBe(2);
    expect(estimateLineRows("1\t8", 8, 4)).toBe(1);
  });

  it("counts CJK and emoji as wide while ignoring combining marks", () => {
    expect(estimateLineRows("界界界", 4)).toBe(2);
    expect(estimateLineRows("🙂🙂🙂", 4)).toBe(2);
    expect(estimateLineRows("e\u0301e\u0301", 2)).toBe(1);
  });
});

describe("measureDiffRowHeight", () => {
  it("includes the hunk boundary margin omitted by getBoundingClientRect", () => {
    const element = document.createElement("div");
    element.style.marginTop = "12px";
    element.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, right: 100, bottom: 28, left: 0, width: 100, height: 28,
      toJSON: () => ({}),
    });
    document.body.appendChild(element);
    expect(measureDiffRowHeight(element)).toBe(40);
    element.remove();
  });
});
