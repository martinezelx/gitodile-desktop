export type RepositoryInfo = {
  name: string;
  path: string;
  selectedPath: string;
  gitDir: string;
  commonGitDir: string;
  branch: string | null;
  headState: "branch" | "detached" | "unborn";
  kind: "repository" | "worktree";
};

/**
 * Copy keys resolved here rather than in the component, so every Overview
 * string is chosen from typed repository data instead of nested ternaries in
 * JSX. Each key must exist in `Translations`.
 */
export type RepositoryOverviewState = {
  isDetached: boolean;
  isUnborn: boolean;
  isWorktree: boolean;
  wasOpenedFromNestedFolder: boolean;
  /** Branch name when the project is on one, `null` for detached HEAD. */
  versionLine: string | null;
  projectTypeKey: "overviewLocalProject" | "overviewSeparateWorkspace";
  projectTypeDescriptionKey: "overviewRepositoryTypeDescription" | "overviewWorktreeTypeDescription";
  headlineKey:
    | "overviewProjectReady"
    | "overviewWorktreeReady"
    | "overviewUnbornReady"
    | "overviewDetachedReady";
  versionDescriptionKey:
    | "overviewVersionLineDescription"
    | "overviewUnbornDescription"
    | "overviewDetachedDescription";
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
    projectTypeDescriptionKey: isWorktree
      ? "overviewWorktreeTypeDescription"
      : "overviewRepositoryTypeDescription",
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
