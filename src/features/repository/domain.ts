export type HeadState = "branch" | "detached" | "unborn";

export type RepositoryInfo = {
  name: string;
  path: string;
  selectedPath: string;
  gitDir: string;
  commonGitDir: string;
  branch: string | null;
  headState: HeadState;
  kind: "repository" | "worktree";
  sessionEpoch: string;
};

export type RepositoryOverviewState = {
  isDetached: boolean;
  isUnborn: boolean;
  isWorktree: boolean;
  wasOpenedFromNestedFolder: boolean;
  versionLine: string | null;
  projectTypeKey: "overviewLocalProject" | "overviewSeparateWorkspace";
  projectTypeDescriptionKey: "overviewRepositoryTypeDescription" | "overviewWorktreeTypeDescription";
  headlineKey: "overviewProjectReady" | "overviewWorktreeReady" | "overviewUnbornReady" | "overviewDetachedReady";
  versionDescriptionKey: "overviewVersionLineDescription" | "overviewUnbornDescription" | "overviewDetachedDescription";
};

export function getRepositoryOverviewState(project: RepositoryInfo): RepositoryOverviewState {
  const isDetached = project.headState === "detached";
  const isUnborn = project.headState === "unborn";
  const isWorktree = project.kind === "worktree";
  return {
    isDetached,
    isUnborn,
    isWorktree,
    wasOpenedFromNestedFolder: project.selectedPath !== project.path,
    versionLine: isDetached ? null : project.branch,
    projectTypeKey: isWorktree ? "overviewSeparateWorkspace" : "overviewLocalProject",
    projectTypeDescriptionKey: isWorktree ? "overviewWorktreeTypeDescription" : "overviewRepositoryTypeDescription",
    headlineKey: isDetached
      ? "overviewDetachedReady"
      : isUnborn
        ? "overviewUnbornReady"
        : isWorktree
          ? "overviewWorktreeReady"
          : "overviewProjectReady",
    versionDescriptionKey: isDetached
      ? "overviewDetachedDescription"
      : isUnborn
        ? "overviewUnbornDescription"
        : "overviewVersionLineDescription",
  };
}
