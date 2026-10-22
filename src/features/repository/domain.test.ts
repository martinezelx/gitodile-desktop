import { describe, expect, it } from "vitest";
import { getRepositoryOverviewState, type RepositoryInfo } from "./domain";

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
      branch: "main",
      projectTypeKey: "overviewLocalProject",
      projectTypeDescriptionKey: "overviewRepositoryTypeDescription",
      headlineKey: "overviewProjectReady",
      versionDescriptionKey: "overviewBranchDescription",
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

  it("does not present detached HEAD as a branch", () => {
    expect(
      getRepositoryOverviewState({
        ...baseProject,
        branch: null,
        headState: "detached",
      }),
    ).toMatchObject({
      isDetached: true,
      branch: null,
      headlineKey: "overviewDetachedReady",
      versionDescriptionKey: "overviewDetachedDescription",
    });
  });

  it("retains the unborn branch while marking that it has no saved versions", () => {
    expect(
      getRepositoryOverviewState({
        ...baseProject,
        headState: "unborn",
      }),
    ).toMatchObject({
      isUnborn: true,
      branch: "main",
      headlineKey: "overviewUnbornReady",
      versionDescriptionKey: "overviewUnbornDescription",
    });
  });
});
