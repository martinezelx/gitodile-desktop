import { describe, expect, it } from "vitest";

import { withActiveBranchGone, type Branch, type BranchesSnapshot } from "./domain";

function branch(name: string, overrides: Partial<Branch> = {}): Branch {
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

const snapshot: BranchesSnapshot = {
  branch: "feature",
  headState: "branch",
  currentCommit: "a".repeat(40),
  branches: [branch("main", { isDefault: true }), branch("feature", { isActive: true })],
  totalCount: 2,
  isTruncated: false,
  unreadableCount: 0,
};

describe("withActiveBranchGone", () => {
  it("marks only the active branch gone when a check said so", () => {
    const marked = withActiveBranchGone(snapshot, "feature");
    expect(marked?.branches.map((entry) => [entry.name, entry.upstreamGone])).toEqual([
      ["main", false],
      ["feature", true],
    ]);
  });

  it("returns the same snapshot when there is nothing to change", () => {
    expect(withActiveBranchGone(snapshot, null)).toBe(snapshot);
    // A status still about the branch the project just left marks nothing.
    expect(withActiveBranchGone(snapshot, "main")).toBe(snapshot);
    const alreadyGone = withActiveBranchGone(snapshot, "feature");
    expect(withActiveBranchGone(alreadyGone, "feature")).toBe(alreadyGone);
    expect(withActiveBranchGone(null, "feature")).toBeNull();
  });
});
