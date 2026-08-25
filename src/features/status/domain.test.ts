import { describe, expect, it } from "vitest";
import {
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
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
