import type { ConsoleOperationId } from "./domain";

export type OutputTone =
  | "plain" | "added" | "removed" | "hunk" | "meta" | "hash"
  | "current" | "staged" | "modified" | "untracked" | "conflict" | "hint";
export type OutputSegment = { text: string; tone: OutputTone };

/** Above this many coloured runs the output is shown as one plain text node. */
export const MAX_OUTPUT_SEGMENTS = 400;

const DIFF_META = /^(diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |rename from |rename to |Binary files )/;
const STATUS_SECTIONS: Record<string, OutputTone> = {
  "Changes to be committed:": "staged",
  "Changes not staged for commit:": "modified",
  "Untracked files:": "untracked",
  "Unmerged paths:": "conflict",
};

function diffLine(line: string): OutputSegment[] {
  if (DIFF_META.test(line)) return [{ text: line, tone: "meta" }];
  if (line.startsWith("@@")) return [{ text: line, tone: "hunk" }];
  if (line.startsWith("+")) return [{ text: line, tone: "added" }];
  if (line.startsWith("-")) return [{ text: line, tone: "removed" }];
  if (line.startsWith("\\")) return [{ text: line, tone: "hint" }];
  return [{ text: line, tone: "plain" }];
}

function logLine(line: string): OutputSegment[] {
  const match = /^([0-9a-f]{7,64})(\s.*)?$/.exec(line);
  return match ? [{ text: match[1], tone: "hash" }, { text: match[2] ?? "", tone: "plain" }] : [{ text: line, tone: "plain" }];
}

function branchLine(line: string): OutputSegment[] {
  if (line.startsWith("* ")) return [{ text: line, tone: "current" }];
  if (line.startsWith("+ ")) return [{ text: line, tone: "hint" }];
  return [{ text: line, tone: "plain" }];
}

function graphLine(line: string): OutputSegment[] {
  const match = /^([*|\\/ _.-]*?)([0-9a-f]{7,64})(\s.*)?$/.exec(line);
  if (!match) return [{ text: line, tone: "hint" }];
  return [{ text: match[1], tone: "hint" }, { text: match[2], tone: "hash" }, { text: match[3] ?? "", tone: "plain" }];
}

function showLine(line: string): OutputSegment[] {
  const commit = /^(commit )([0-9a-f]{7,64})(.*)$/.exec(line);
  if (commit) return [{ text: commit[1], tone: "meta" }, { text: commit[2], tone: "hash" }, { text: commit[3], tone: "meta" }];
  if (/^(Author|AuthorDate|Commit|CommitDate|Date|Merge):/.test(line)) return [{ text: line, tone: "meta" }];
  // A `--stat` line: " path | 12 ++++--".
  const stat = /^(.* \| +\d+ )(\+*)(-*)$/.exec(line);
  if (stat) return [{ text: stat[1], tone: "plain" }, { text: stat[2], tone: "added" }, { text: stat[3], tone: "removed" }];
  return [{ text: line, tone: "plain" }];
}

/** A leading name or count (a remote, a stash, an author's tally) in the accent. */
function leadingLine(pattern: RegExp): (line: string) => OutputSegment[] {
  return (line) => {
    const match = pattern.exec(line);
    return match ? [{ text: match[1], tone: "hash" }, { text: match[2], tone: "plain" }] : [{ text: line, tone: "plain" }];
  };
}

const LINE_TONES: Record<Exclude<ConsoleOperationId, "status">, (line: string) => OutputSegment[]> = {
  diff: diffLine,
  staged: diffLine,
  log: logLine,
  graph: graphLine,
  last: showLine,
  branches: branchLine,
  tags: (line) => [{ text: line, tone: "plain" }],
  remotes: leadingLine(/^(\S+)(\s.*)$/),
  stashes: leadingLine(/^(stash@\{\d+\})(.*)$/),
  authors: leadingLine(/^(\s*\d+)(\t.*)$/),
};

function statusLines(lines: readonly string[]): OutputSegment[][] {
  let section: OutputTone = "plain";
  return lines.map((line) => {
    if (line in STATUS_SECTIONS) { section = STATUS_SECTIONS[line]; return [{ text: line, tone: "plain" }]; }
    if (line === "") section = "plain";
    if (line.startsWith("\t") && section !== "plain") return [{ text: line, tone: section }];
    if (/^\s+\(use /.test(line)) return [{ text: line, tone: "hint" }];
    if (line.startsWith("On branch ")) return [{ text: "On branch ", tone: "plain" }, { text: line.slice(10), tone: "current" }];
    return [{ text: line, tone: "plain" }];
  });
}

/**
 * Colour a fixed query's known output shape. Each result is plain text; the
 * tones only choose a class for a text run, so nothing in the output can act
 * as markup or a terminal control. Returns null when there is too much to
 * colour cheaply, and the caller shows the text as it is.
 */
export function highlightOutput(operationId: ConsoleOperationId, text: string): OutputSegment[] | null {
  const lines = text.split("\n");
  const perLine = operationId === "status" ? statusLines(lines) : lines.map(LINE_TONES[operationId]);
  const segments: OutputSegment[] = [];
  perLine.forEach((line, index) => {
    const withBreak = index < perLine.length - 1 ? [...line.slice(0, -1), { ...line[line.length - 1], text: `${line[line.length - 1].text}\n` }] : line;
    for (const segment of withBreak) {
      if (!segment.text) continue;
      const last = segments.at(-1);
      if (last && (last.tone === segment.tone || segment.text === "\n")) last.text += segment.text;
      else segments.push({ ...segment });
    }
  });
  return segments.length > MAX_OUTPUT_SEGMENTS ? null : segments;
}
