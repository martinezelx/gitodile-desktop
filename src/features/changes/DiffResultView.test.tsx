import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { translations } from "../../i18n";
import { DiffResultView, lineColumns, widestRowColumns } from "./DiffResultView";
import { DiffPreferencesProvider, DEFAULT_DIFF_PREFERENCES, type DiffPreferences } from "./diffPreferences";
import type { DiffHunk, FileDiff } from "./domain";

afterEach(cleanup);

const t = translations.en;

/** The only change here is indentation, so ignoring whitespace empties it. */
const indentationHunk: DiffHunk = {
  header: "@@ -1,3 +1,3 @@",
  oldStart: 1,
  oldLines: 3,
  newStart: 1,
  newLines: 3,
  lines: [
    { kind: "context", content: "function f() {", oldLineNumber: 1, newLineNumber: 1 },
    { kind: "deletion", content: "  return 1;", oldLineNumber: 2, newLineNumber: null },
    { kind: "addition", content: "\treturn 1;", oldLineNumber: null, newLineNumber: 2 },
    { kind: "context", content: "}", oldLineNumber: 3, newLineNumber: 3 },
  ],
};

const realChangeHunk: DiffHunk = {
  header: "@@ -10,2 +10,2 @@",
  oldStart: 10,
  oldLines: 2,
  newStart: 10,
  newLines: 2,
  lines: [
    { kind: "deletion", content: "const a = 1;", oldLineNumber: 10, newLineNumber: null },
    { kind: "addition", content: "const a = 2;", oldLineNumber: null, newLineNumber: 10 },
  ],
};

function textDiff(hunks: DiffHunk[]): FileDiff {
  return { kind: "text", path: "src/app.ts", originalPath: null, change: "changed", truncated: false, hunks };
}

const whitespaceOnlyDiff = textDiff([indentationHunk]);
const mixedDiff = textDiff([indentationHunk, realChangeHunk]);

/** The virtualized views render nothing under jsdom — the `ResizeObserver`
 * stub in `testSetup.ts` never fires, so the virtualizer never learns its
 * viewport size. Structure (classes, `tab-size`) is still assertable there;
 * anything about the *content* goes through the accessible view, which is one
 * plain `<pre>` and not virtualized at all. */
function renderDiff(
  preferences: Partial<DiffPreferences> = {},
  viewMode?: "accessible",
  diff: FileDiff = whitespaceOnlyDiff,
) {
  return render(
    <DiffPreferencesProvider value={{ ...DEFAULT_DIFF_PREFERENCES, ...preferences }}>
      <DiffResultView diff={diff} viewMode={viewMode} t={t} />
    </DiffPreferencesProvider>,
  );
}

/** Raw `textContent`, not `toHaveTextContent`: that matcher collapses runs of
 * whitespace, which is the one thing these assertions are about. */
function diffText(): string {
  return document.querySelector(".diff-code")?.textContent ?? "";
}

function scroller(): HTMLElement {
  const element = document.querySelector(".diff-code");
  if (!element) {
    throw new Error("no diff scroller rendered");
  }
  return element as HTMLElement;
}

describe("unwrapped line widths", () => {
  it("counts display columns with tabs expanded to the next stop", () => {
    expect(lineColumns("abc", 8)).toBe(3);
    // A tab advances to the next multiple of the tab size, not by it.
    expect(lineColumns("	abc", 8)).toBe(11);
    expect(lineColumns("ab	c", 8)).toBe(9);
    expect(lineColumns("	abc", 2)).toBe(5);
  });

  it("counts a wide glyph as two columns and a combining mark as none", () => {
    expect(lineColumns("漢字", 8)).toBe(4);
    expect(lineColumns("é", 8)).toBe(1);
  });

  it("finds the widest line for each geometry", () => {
    const rows = [
      { kind: "marker" as const, hunkIndex: 0, hiddenLines: 3, gap: { hiddenLines: 3, oldStart: 1, newStart: 1 } },
      { kind: "line" as const, hunkIndex: 0, line: { kind: "context" as const, content: "short", oldLineNumber: 1, newLineNumber: 1 } },
      { kind: "line" as const, hunkIndex: 0, line: { kind: "addition" as const, content: "	much longer line", oldLineNumber: null, newLineNumber: 2 } },
    ];

    // The marker contributes nothing: it is a chip, not a line of code.
    expect(widestRowColumns(rows, 8)).toEqual({ unified: 8 + "much longer line".length, split: 0 });
  });

  it("measures both halves of a split row against one shared width", () => {
    const rows = [
      {
        kind: "pair" as const,
        hunkIndex: 0,
        left: { kind: "deletion" as const, content: "a", oldLineNumber: 1, newLineNumber: null },
        right: { kind: "addition" as const, content: "a much longer replacement", oldLineNumber: null, newLineNumber: 1 },
      },
    ];

    // One number for both columns, or the divider moves from row to row.
    expect(widestRowColumns(rows, 8)).toEqual({ unified: 0, split: "a much longer replacement".length });
  });
});

describe("DiffResultView reading preferences", () => {
  it("renders today's behaviour with the defaults", () => {
    renderDiff({}, "accessible");

    // Every default has to reproduce what the viewer did before any of this
    // was configurable, or an existing user sees a change they never asked for.
    expect(scroller()).toHaveClass("diff-code--accessible-wrap");
    expect(scroller().style.tabSize).toBe("8");
    expect(diffText()).toContain("-  return 1;");
  });

  it("switches the viewer to horizontal scrolling when wrapping is off", () => {
    renderDiff({ wrapLines: false });

    expect(scroller()).toHaveClass("diff-code--nowrap");
  });

  it("stops wrapping the accessible view too", () => {
    renderDiff({ wrapLines: false }, "accessible");

    // A preference that only held in two views out of three would be a
    // setting that quietly does not apply.
    expect(scroller()).not.toHaveClass("diff-code--accessible-wrap");
  });

  it("carries the tab width onto the element the diff inherits from", () => {
    renderDiff({ tabWidth: 2 });

    // Set on the scroller rather than per line so the metrics reader can find
    // it in the computed style, which is where the row-height estimate for a
    // tab-indented line comes from.
    expect(scroller().style.tabSize).toBe("2");
  });

  it("drops a whitespace-only hunk while keeping the real one", () => {
    renderDiff({ ignoreWhitespace: true }, "accessible", mixedDiff);

    const text = diffText();
    // The re-indented pair collapses to context, which leaves that hunk with
    // no changes in it at all — so it goes, exactly as `git diff -w` would
    // never have emitted it. Its lines are ordinary unchanged context now,
    // reachable through the neighbouring gap markers like any other.
    expect(text).not.toContain("-  return 1;");
    expect(text).not.toContain("return 1;");
    // The real change is untouched.
    expect(text).toContain("-const a = 1;");
    expect(text).toContain("+const a = 2;");
  });

  it("says so rather than going blank when every change was whitespace", () => {
    renderDiff({ ignoreWhitespace: true }, "accessible");

    // Filtering the only hunk away leaves nothing to render, and an empty
    // pane for a file the list says has changed reads as a bug.
    expect(screen.getByRole("heading", { name: "Only spacing changed" })).toBeInTheDocument();
    expect(document.querySelector(".diff-code")).toBeNull();
  });
});
