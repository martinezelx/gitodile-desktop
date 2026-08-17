import { describe, expect, it } from "vitest";

import { applyIgnoreWhitespace, collapseWhitespaceOnlyChanges } from "./ignoreWhitespace";
import type { DiffHunk, DiffLine } from "./domain";

function deletion(content: string, oldLineNumber: number): DiffLine {
  return { kind: "deletion", content, oldLineNumber, newLineNumber: null };
}
function addition(content: string, newLineNumber: number): DiffLine {
  return { kind: "addition", content, oldLineNumber: null, newLineNumber };
}
function context(content: string, line: number): DiffLine {
  return { kind: "context", content, oldLineNumber: line, newLineNumber: line };
}

describe("collapseWhitespaceOnlyChanges", () => {
  it("turns a re-indented line back into the unchanged line it is", () => {
    const collapsed = collapseWhitespaceOnlyChanges([
      context("function f() {", 1),
      deletion("  return 1;", 2),
      addition("\t\treturn 1;", 2),
      context("}", 3),
    ]);

    expect(collapsed.map((line) => line.kind)).toEqual(["context", "context", "context"]);
    // The addition's text survives, because that is what the file says now.
    expect(collapsed[1]).toEqual({
      kind: "context",
      content: "\t\treturn 1;",
      oldLineNumber: 2,
      newLineNumber: 2,
    });
  });

  it("leaves a real change alone even when it also moved indentation", () => {
    const lines = [deletion("  return 1;", 2), addition("    return 2;", 2)];

    expect(collapseWhitespaceOnlyChanges(lines)).toEqual(lines);
  });

  it("keeps the leftovers when one run is longer than the other", () => {
    const collapsed = collapseWhitespaceOnlyChanges([
      deletion("  a", 1),
      deletion("  b", 2),
      addition("a", 1),
    ]);

    expect(collapsed.map((line) => [line.kind, line.content])).toEqual([
      ["context", "a"],
      ["deletion", "  b"],
    ]);
  });

  it("stops at the first real difference instead of reordering what follows", () => {
    // A per-index filter would have hoisted the matching third pair above the
    // second one's deletion, silently rewriting the order of the diff.
    const collapsed = collapseWhitespaceOnlyChanges([
      deletion("  a", 1),
      deletion("  b", 2),
      addition("a", 1),
      addition("B", 2),
    ]);

    expect(collapsed.map((line) => [line.kind, line.content])).toEqual([
      ["context", "a"],
      ["deletion", "  b"],
      ["addition", "B"],
    ]);
  });

  it("treats added and removed whitespace between tokens as whitespace", () => {
    const collapsed = collapseWhitespaceOnlyChanges([deletion("a + b", 1), addition("a+b", 1)]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].kind).toBe("context");
  });
});

describe("applyIgnoreWhitespace", () => {
  function hunk(lines: DiffLine[]): DiffHunk {
    return { header: "@@", oldStart: 1, oldLines: lines.length, newStart: 1, newLines: lines.length, lines };
  }

  it("drops a hunk that had nothing but whitespace changes in it", () => {
    const hunks = [
      hunk([deletion("  a", 1), addition("a", 1)]),
      hunk([deletion("old", 5), addition("new", 5)]),
    ];

    const result = applyIgnoreWhitespace(hunks);

    // Leaving the first hunk in would show a change the user asked not to see.
    expect(result).toHaveLength(1);
    expect(result[0].lines.map((line) => line.content)).toEqual(["old", "new"]);
  });

  it("leaves the hunks untouched when nothing is whitespace-only", () => {
    const hunks = [hunk([context("a", 1), deletion("b", 2), addition("c", 2)])];

    expect(applyIgnoreWhitespace(hunks)).toEqual(hunks);
  });
});
