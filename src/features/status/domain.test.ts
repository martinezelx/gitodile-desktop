import { describe, expect, it } from "vitest";
import {
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  workingTreeSnapshotsEqual,
  type WorkingTreeCounts,
  type WorkingTreeStatus,
} from "./domain";

function status(counts: Partial<WorkingTreeCounts>): WorkingTreeStatus {
  const filled: WorkingTreeCounts = {
    changed: 0,
    new: 0,
    deleted: 0,
    renamed: 0,
    conflicted: 0,
    total: 0,
    ...counts,
  };
  return {
    isClean: filled.total === 0,
    counts: filled,
    lineTotals: null,
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: false,
    upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
  };
}

describe("getWorkingTreeSummary", () => {
  it("treats a clean tree as a finished state, not an empty one", () => {
    expect(getWorkingTreeSummary(status({}))).toEqual({
      tone: "positive",
      headlineKey: "statusCleanTitle",
      total: 0,
      conflicted: 0,
    });
  });

  it("reports unsaved changes as an ordinary, neutral state", () => {
    expect(getWorkingTreeSummary(status({ changed: 2, new: 1, total: 3 }))).toEqual({
      tone: "neutral",
      headlineKey: "statusChangesTitle",
      total: 3,
      conflicted: 0,
    });
  });

  it("raises conflicts above the ordinary change count", () => {
    expect(getWorkingTreeSummary(status({ changed: 4, conflicted: 2, total: 6 }))).toEqual({
      tone: "attention",
      headlineKey: "statusConflictsTitle",
      total: 6,
      conflicted: 2,
    });
  });
});

describe("getWorkingTreeBreakdown", () => {
  it("omits empty categories and puts conflicts first", () => {
    expect(
      getWorkingTreeBreakdown(status({ changed: 3, deleted: 1, conflicted: 2, total: 6 })),
    ).toEqual([
      { category: "conflicted", count: 2 },
      { category: "changed", count: 3 },
      { category: "deleted", count: 1 },
    ]);
  });

  it("returns nothing for a clean tree", () => {
    expect(getWorkingTreeBreakdown(status({}))).toEqual([]);
  });
});

describe("workingTreeSnapshotsEqual", () => {
  it("treats a changed line total as a new snapshot", () => {
    const withTotals = (added: number): WorkingTreeStatus => ({
      ...status({ changed: 1, total: 1 }),
      lineTotals: { added, removed: 0 },
    });

    expect(workingTreeSnapshotsEqual(withTotals(4), withTotals(4))).toBe(true);
    expect(workingTreeSnapshotsEqual(withTotals(4), withTotals(5))).toBe(false);
    // Known zero and unknown are different answers, so they are different
    // snapshots even when every other field agrees.
    expect(workingTreeSnapshotsEqual(null, withTotals(4))).toBe(false);
    expect(workingTreeSnapshotsEqual(withTotals(4), { ...withTotals(4), lineTotals: null })).toBe(false);
  });
});
