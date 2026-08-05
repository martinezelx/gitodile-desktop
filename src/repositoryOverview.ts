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

/** Conflicts need attention, so they lead. The one reading order shared by the
 * status breakdown chips and every change list, so a file never sits in a
 * different place depending on which screen is showing it. */
export const CATEGORY_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

/** `Array.prototype.sort` is stable per spec, so entries within the same
 * category keep the order the backend returned them in — a documented,
 * deterministic ordering. */
export function getOrderedChangeEntries(status: WorkingTreeStatus): WorkingTreeEntry[] {
  const rank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  return [...status.entries].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99));
}

/** Splits a repository-relative path into its file name and containing
 * directory, so a list can show the name prominently with the directory as a
 * muted second line — the reading order most Git clients (GitHub Desktop,
 * GitKraken, Sourcetree) use. Paths always use `/` as the porcelain output
 * separator, regardless of platform. */
export function splitPath(path: string): { name: string; dir: string | null } {
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return { name: path, dir: null };
  }
  return { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

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
  return CATEGORY_ORDER.map((category) => ({ category, count: status.counts[category] })).filter(
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
