import { describe, expect, it } from "vitest";
import { getRepositoryOverviewState, type RepositoryInfo } from "./features/repository";
import {
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  type WorkingTreeCounts,
  type WorkingTreeStatus,
} from "./features/status";

const baseProject: RepositoryInfo = {
  name: "example",
  path: "C:\\projects\\example",
  selectedPath: "C:\\projects\\example",
  gitDir: "C:\\projects\\example\\.git",
  commonGitDir: "C:\\projects\\example\\.git",
  branch: "main",
  headState: "branch",
  kind: "repository",
  sessionEpoch: "overview-test-epoch",
};

describe("getRepositoryOverviewState", () => {
  it("describes a normal repository without inventing special states", () => {
    expect(getRepositoryOverviewState(baseProject)).toEqual({
      isDetached: false,
      isUnborn: false,
      isWorktree: false,
      wasOpenedFromNestedFolder: false,
      versionLine: "main",
      projectTypeKey: "overviewLocalProject",
      projectTypeDescriptionKey: "overviewRepositoryTypeDescription",
      headlineKey: "overviewProjectReady",
      versionDescriptionKey: "overviewVersionLineDescription",
    });
  });

  it("recognizes a nested selection and linked worktree", () => {
    expect(
      getRepositoryOverviewState({
        ...baseProject,
        selectedPath: "C:\\projects\\example\\src",
        kind: "worktree",
      }),
    ).toMatchObject({
      isWorktree: true,
      wasOpenedFromNestedFolder: true,
      projectTypeKey: "overviewSeparateWorkspace",
      projectTypeDescriptionKey: "overviewWorktreeTypeDescription",
      headlineKey: "overviewWorktreeReady",
    });
  });

  it("does not present detached HEAD as a version line", () => {
    expect(
      getRepositoryOverviewState({
        ...baseProject,
        branch: null,
        headState: "detached",
      }),
    ).toMatchObject({
      isDetached: true,
      versionLine: null,
      headlineKey: "overviewDetachedReady",
      versionDescriptionKey: "overviewDetachedDescription",
    });
  });

  it("retains the unborn version line while marking that it has no saved versions", () => {
    expect(
      getRepositoryOverviewState({
        ...baseProject,
        headState: "unborn",
      }),
    ).toMatchObject({
      isUnborn: true,
      versionLine: "main",
      headlineKey: "overviewUnbornReady",
      versionDescriptionKey: "overviewUnbornDescription",
    });
  });
});

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
