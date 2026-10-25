import { describe, expect, it } from "vitest";
import { buildMarkdownExcerpt, buildUnifiedMarkdown, compareMarkdown } from "./markdownChanges";
import type { DiffHunk } from "./domain";

const hunk = (oldStart: number, newStart: number, before = "# Old", after = "# New"): DiffHunk => ({
  header: "", oldStart, newStart, oldLines: 1, newLines: 1,
  lines: [{ kind: "deletion", content: before, oldLineNumber: oldStart, newLineNumber: null },
    { kind: "addition", content: after, oldLineNumber: null, newLineNumber: newStart }],
});

describe("Markdown source comparison", () => {
  it("locates additions, removals and replacements without shifting unchanged lines", () => {
    const result = compareMarkdown("# Old\n\nRemoved\n\nKeep\n", "# New\n\nKeep\n\nAdded\n");
    expect(result?.removed).toEqual(new Set([1, 3, 4]));
    expect(result?.added).toEqual(new Set([1, 4, 5]));
  });
  it("handles new/deleted files and ignores CRLF and final-newline-only differences", () => {
    expect(compareMarkdown(null, "# New\n")?.added).toEqual(new Set([1]));
    expect(compareMarkdown("# Deleted\n", null)?.removed).toEqual(new Set([1]));
    expect(compareMarkdown("# Same\r\n", "# Same")?.added.size).toBe(0);
    expect(compareMarkdown("", "")).toEqual({ added: new Set(), removed: new Set() });
  });
  it("never invents rendered changes or navigation stops for CRLF in multiline Markdown", () => {
    const source = "# Same\n\nA paragraph across\nmultiple lines.\n\n- A list item\n  on two lines.\n\n```text\nfirst\nsecond\n```\n";
    const result = buildUnifiedMarkdown(source, source.replace(/\n/g, "\r\n"));
    expect(result?.changeCount).toBe(0);
    expect(result?.added.size).toBe(0);
    expect(result?.removed.size).toBe(0);
    expect(JSON.stringify(result?.tree)).not.toMatch(/markdown-preview__(added|removed)/);
  });
  it("refuses pathological edit distances rather than freezing or claiming no changes", () => {
    const before = Array.from({ length: 4100 }, (_, index) => `old ${index}`).join("\n");
    const after = Array.from({ length: 4100 }, (_, index) => `new ${index}`).join("\n");
    expect(compareMarkdown(before, after)).toBeNull();
  });
  it("refuses excessive Markdown nesting gracefully", () => {
    const source = `${"> ".repeat(90)}Nested paragraph`;
    expect(buildUnifiedMarkdown(null, source)).toBeNull();
  });
  it("groups replacements and traverses nested changes without stops for unused footnotes", () => {
    const result = buildUnifiedMarkdown("# Old\n\nKeep.\n\n- Old item\n\nUnused[^n].\n\n[^n]: Old note", "# New\n\nKeep.\n\n- New item\n\nUnused[^n].\n\n[^n]: Old note");
    expect(result?.changeCount).toBe(2);
    expect(JSON.stringify(result?.tree).match(/data-markdown-change/g)).toHaveLength(2);
    expect(buildUnifiedMarkdown("[^a]: Unused old note", "[^a]: Unused new note")?.changeCount).toBe(0);
  });
  it("isolates excerpts and numbers their stops across source gaps", () => {
    const result = buildMarkdownExcerpt([hunk(10, 10), hunk(900, 901)], false);
    expect(result?.chunks).toHaveLength(2);
    expect(result?.changeCount).toBe(2);
    expect(result?.limited).toBe(false);
    expect(result?.chunks[1].comparison.tree.children[0].data?.hProperties?.["data-markdown-change"]).toBe("1");
    expect(result?.chunks[1].newStart).toBe(901);
  });
  it("omits incomplete hunks and bounds excerpt content without slicing a hunk", () => {
    expect(buildMarkdownExcerpt([{ ...hunk(1, 1), oldLines: 3 }], true)).toBeNull();
    expect(buildMarkdownExcerpt([hunk(1, 1, "x".repeat(33000))], false)).toBeNull();
    const result = buildMarkdownExcerpt([hunk(1, 1), { ...hunk(30, 30), newLines: 8 }], true);
    expect(result?.chunks).toHaveLength(1);
    expect(result?.limited).toBe(true);
    const many = buildMarkdownExcerpt(Array.from({ length: 30 }, (_, index) => hunk(index * 20, index * 20)), false);
    expect(many?.chunks.length).toBeLessThanOrEqual(24);
    expect(many?.limited).toBe(true);
  });
});
