import { describe, expect, it } from "vitest";
import {
  estimateLineRows,
  flattenDiffRows,
  getOrderedChangeEntries,
  isFirstRowOfHunk,
  measureDiffRowHeight,
  resolveSelectedPath,
} from "./changes";
import type { DiffHunk, DiffLine } from "./changes";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "./repositoryOverview";

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
      { kind: "marker", hunkIndex: 1, hiddenLines: 8 },
      { kind: "line", hunkIndex: 1, line: hunks[1].lines[0] },
    ]);
  });

  it("emits no marker when hunks are adjacent with nothing hidden between them", () => {
    const hunks = [hunk(1, 1, [line("context", "a")]), hunk(2, 1, [line("context", "b")])];

    expect(flattenDiffRows(hunks).map((row) => row.kind)).toEqual(["line", "line"]);
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
