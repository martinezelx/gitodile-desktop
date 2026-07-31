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

/** Mirrors the Rust `ChangeCategory`: what happened to a file, not where Git
 * recorded it. The index/worktree split belongs to the save-version flow. */
export type ChangeCategory = "changed" | "new" | "deleted" | "renamed" | "conflicted";

export type WorkingTreeEntry = {
  path: string;
  originalPath: string | null;
  category: ChangeCategory;
  isPrepared: boolean;
  hasUnpreparedChanges: boolean;
};

export type WorkingTreeCounts = Record<ChangeCategory, number> & { total: number };

export type WorkingTreeStatus = {
  isClean: boolean;
  counts: WorkingTreeCounts;
  entries: WorkingTreeEntry[];
  /** The entry list is capped for very large statuses; `counts` never is. */
  truncated: boolean;
  hasPreparedChanges: boolean;
  hasUnpreparedChanges: boolean;
  /** Captured from `--branch` but not presented until the remote work exists. */
  upstream: {
    branch: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
  };
};

export type WorkingTreeSummary = {
  /** Conflicts need attention; a clean tree is a finished state, not an empty one. */
  tone: "positive" | "attention" | "neutral";
  headlineKey: "statusCleanTitle" | "statusChangesTitle" | "statusConflictsTitle";
  total: number;
  conflicted: number;
};

/** Category counts worth showing, in a fixed reading order, zeroes omitted. */
const BREAKDOWN_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

export function getWorkingTreeSummary(status: WorkingTreeStatus): WorkingTreeSummary {
  const conflicted = status.counts.conflicted;
  if (conflicted > 0) {
    return { tone: "attention", headlineKey: "statusConflictsTitle", total: status.counts.total, conflicted };
  }
  if (status.counts.total === 0) {
    return { tone: "positive", headlineKey: "statusCleanTitle", total: 0, conflicted: 0 };
  }
  return { tone: "neutral", headlineKey: "statusChangesTitle", total: status.counts.total, conflicted: 0 };
}

export function getWorkingTreeBreakdown(
  status: WorkingTreeStatus,
): { category: ChangeCategory; count: number }[] {
  return BREAKDOWN_ORDER.map((category) => ({ category, count: status.counts[category] })).filter(
    (item) => item.count > 0,
  );
}

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
