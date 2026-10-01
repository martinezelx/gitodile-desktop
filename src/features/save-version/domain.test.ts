import { describe, expect, it } from "vitest";
import { getSaveVersionBreakdown, previewFromWorkingTree, SAVE_PLAN_FILE_LIMIT } from "./domain";
import type { WorkingTreeCounts, WorkingTreeStatus } from "../status";

function counts(overrides: Partial<WorkingTreeCounts>): WorkingTreeCounts {
  return { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0, ...overrides };
}

describe("getSaveVersionBreakdown", () => {
  it("omits zero counts", () => {
    expect(getSaveVersionBreakdown(counts({ changed: 2, total: 2 }))).toEqual([{ category: "changed", count: 2 }]);
  });

  it("orders conflicted first, then changed/new/deleted/renamed", () => {
    const breakdown = getSaveVersionBreakdown(
      counts({ renamed: 1, deleted: 1, new: 1, changed: 1, conflicted: 1, total: 5 }),
    );
    expect(breakdown.map((item) => item.category)).toEqual(["conflicted", "changed", "new", "deleted", "renamed"]);
  });

  it("returns an empty list for a clean plan", () => {
    expect(getSaveVersionBreakdown(counts({}))).toEqual([]);
  });
});

function tree(overrides: Partial<WorkingTreeStatus> = {}, countOverrides: Partial<WorkingTreeCounts> = {}): WorkingTreeStatus {
  return {
    isClean: false,
    counts: counts({ changed: 2, new: 1, total: 3, ...countOverrides }),
    lineTotals: null,
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: true,
    upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
    ...overrides,
  };
}

describe("previewFromWorkingTree", () => {
  const ask = (
    workingTree: WorkingTreeStatus | null,
    headState: "branch" | "detached" | "unborn" = "branch",
    selectedPaths: string[] | null = null,
  ) => previewFromWorkingTree({ workingTree, headState, selectedPaths });

  it("reads the summary from the cached status", () => {
    expect(ask(tree({ hasPreparedChanges: true }))).toEqual({
      branch: "main",
      isFirstVersion: false,
      totalFiles: 3,
      remainingFiles: 0,
      hasPreparedChanges: true,
      counts: counts({ changed: 2, new: 1, total: 3 }),
      files: [],
    });
  });

  it("lists the files the plan will, cut where the plan cuts", () => {
    const entries = Array.from({ length: SAVE_PLAN_FILE_LIMIT + 2 }, (_, index) => ({
      path: `f${index}.txt`,
      originalPath: null,
      category: "new" as const,
      isPrepared: false,
      hasUnpreparedChanges: true,
    }));
    const files = ask(tree({ entries }))?.files ?? [];
    expect(files).toHaveLength(SAVE_PLAN_FILE_LIMIT);
    expect(files[0]).toEqual({ path: "f0.txt", originalPath: null, category: "new" });
  });

  it("knows a first version from an unborn line", () => {
    expect(ask(tree(), "unborn")?.isFirstVersion).toBe(true);
  });

  it("is null when the cache can't stand for the plan", () => {
    expect(ask(null)).toBeNull();
    expect(ask(tree({ isClean: true }, { changed: 0, new: 0, total: 0 }))).toBeNull();
    expect(ask(tree({}, { conflicted: 1 }))).toBeNull();
    expect(ask(tree(), "detached")).toBeNull();
    expect(ask(tree({ upstream: { branch: null, upstream: null, ahead: 0, behind: 0 } }))).toBeNull();
  });

  it("is null for a partial selection, whose counts are the selection's", () => {
    expect(ask(tree(), "branch", ["a.txt"])).toBeNull();
  });
});
