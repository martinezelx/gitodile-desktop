import { describe, expect, it } from "vitest";

import { withActiveLineGone, type VersionLine, type VersionLinesSnapshot } from "./domain";

function line(name: string, overrides: Partial<VersionLine> = {}): VersionLine {
  return {
    name,
    tip: { commit: "a".repeat(40), shortCommit: "aaaaaaa", subject: "work", committedAt: "2026-10-13T10:00:00Z" },
    isActive: false,
    upstream: `origin/${name}`,
    isRetainedElsewhere: true,
    isFinished: true,
    uniqueCommitCount: null,
    worktreePath: null,
    upstreamAhead: 0,
    upstreamBehind: 0,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

const snapshot: VersionLinesSnapshot = {
  branch: "feature",
  headState: "branch",
  currentCommit: "a".repeat(40),
  lines: [line("main", { isDefault: true }), line("feature", { isActive: true })],
  totalCount: 2,
  isTruncated: false,
  unreadableCount: 0,
};

describe("withActiveLineGone", () => {
  it("marks only the active line gone when a check said so", () => {
    const marked = withActiveLineGone(snapshot, "feature");
    expect(marked?.lines.map((entry) => [entry.name, entry.upstreamGone])).toEqual([
      ["main", false],
      ["feature", true],
    ]);
  });

  it("returns the same snapshot when there is nothing to change", () => {
    expect(withActiveLineGone(snapshot, null)).toBe(snapshot);
    // A status still about the line the project just left marks nothing.
    expect(withActiveLineGone(snapshot, "main")).toBe(snapshot);
    const alreadyGone = withActiveLineGone(snapshot, "feature");
    expect(withActiveLineGone(alreadyGone, "feature")).toBe(alreadyGone);
    expect(withActiveLineGone(null, "feature")).toBeNull();
  });
});
