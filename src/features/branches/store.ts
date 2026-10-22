import type { BranchesSnapshot } from "./domain";

export type BranchesState = {
  projectId: string;
  sessionEpoch: string;
  snapshot: BranchesSnapshot | null;
  error: unknown | null;
  isLoading: boolean;
  generation: number;
};

export const EMPTY_BRANCHES_STATE: BranchesState = Object.freeze({
  projectId: "",
  sessionEpoch: "",
  snapshot: null,
  error: null,
  isLoading: false,
  generation: 0,
});

export function branchesSnapshotsEqual(
  left: BranchesSnapshot | null,
  right: BranchesSnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.branch !== right.branch ||
    left.headState !== right.headState ||
    left.currentCommit !== right.currentCommit ||
    left.totalCount !== right.totalCount ||
    left.isTruncated !== right.isTruncated ||
    left.unreadableCount !== right.unreadableCount ||
    left.branches.length !== right.branches.length
  ) {
    return false;
  }
  return left.branches.every((branch, index) => {
    const other = right.branches[index];
    return (
      branch.name === other.name &&
      branch.tip.commit === other.tip.commit &&
      branch.tip.shortCommit === other.tip.shortCommit &&
      branch.tip.subject === other.tip.subject &&
      branch.tip.committedAt === other.tip.committedAt &&
      branch.isActive === other.isActive &&
      branch.upstream === other.upstream &&
      branch.isRetainedElsewhere === other.isRetainedElsewhere &&
      branch.uniqueCommitCount === other.uniqueCommitCount &&
      branch.worktreePath === other.worktreePath &&
      branch.upstreamAhead === other.upstreamAhead &&
      branch.upstreamBehind === other.upstreamBehind &&
      branch.upstreamGone === other.upstreamGone
    );
  });
}
