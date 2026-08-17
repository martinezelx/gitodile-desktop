import type { DiffHunk, DiffLine } from "./domain";

/** Two lines are "the same but for whitespace" when they match once every
 * space, tab and other whitespace character is removed — the comparison
 * `git diff -w` makes. Stripping rather than collapsing is deliberate: `a b`
 * and `ab` differ only in whitespace by that definition, and Git agrees. */
function withoutWhitespace(content: string): string {
  return content.replace(/\s+/gu, "");
}

/** Git emits a replacement as a run of deletions followed by a run of
 * additions. Pairing them positionally is what lets a line that only changed
 * indentation be recognised — and it is also why unequal runs keep their
 * leftovers: those are real changes with no counterpart. */
function collapseRun(deletions: DiffLine[], additions: DiffLine[]): DiffLine[] {
  const pairedCount = Math.min(deletions.length, additions.length);
  let matched = 0;
  const collapsed: DiffLine[] = [];
  while (
    matched < pairedCount &&
    withoutWhitespace(deletions[matched].content) === withoutWhitespace(additions[matched].content)
  ) {
    // The addition's content is kept: it is what the file says now, and the
    // whitespace the user chose to ignore is exactly what differs.
    collapsed.push({
      kind: "context",
      content: additions[matched].content,
      oldLineNumber: deletions[matched].oldLineNumber,
      newLineNumber: additions[matched].newLineNumber,
    });
    matched += 1;
  }
  // Only a prefix is collapsed. Stopping at the first mismatch keeps the
  // remaining deletions and additions in their original order, which a
  // per-index filter would scramble.
  return [...collapsed, ...deletions.slice(matched), ...additions.slice(matched)];
}

/** Rewrites a hunk's lines so add/remove pairs that differ only in whitespace
 * read as the unchanged lines they are. Nothing is dropped: a collapsed pair
 * becomes one context line, so the surrounding line numbers still line up. */
export function collapseWhitespaceOnlyChanges(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].kind !== "deletion") {
      result.push(lines[index]);
      index += 1;
      continue;
    }
    const deletions: DiffLine[] = [];
    while (index < lines.length && lines[index].kind === "deletion") {
      deletions.push(lines[index]);
      index += 1;
    }
    const additions: DiffLine[] = [];
    while (index < lines.length && lines[index].kind === "addition") {
      additions.push(lines[index]);
      index += 1;
    }
    result.push(...collapseRun(deletions, additions));
  }
  return result;
}

/** A hunk whose every line ends up unchanged is dropped: it was a
 * whitespace-only hunk, and leaving it in would show a change the user just
 * asked not to be shown. Its gap is absorbed by the neighbouring hunks'
 * "N unchanged lines" markers, which are computed from line numbers. */
export function applyIgnoreWhitespace(hunks: DiffHunk[]): DiffHunk[] {
  return hunks
    .map((hunk) => ({ ...hunk, lines: collapseWhitespaceOnlyChanges(hunk.lines) }))
    .filter((hunk) => hunk.lines.some((line) => line.kind !== "context"));
}
