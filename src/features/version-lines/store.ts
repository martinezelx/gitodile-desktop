import type { VersionLinesSnapshot } from "./domain";

export type VersionLinesState = {
  projectId: string;
  sessionEpoch: string;
  snapshot: VersionLinesSnapshot | null;
  error: unknown | null;
  isLoading: boolean;
  generation: number;
};

export const EMPTY_VERSION_LINES_STATE: VersionLinesState = Object.freeze({
  projectId: "",
  sessionEpoch: "",
  snapshot: null,
  error: null,
  isLoading: false,
  generation: 0,
});

export function versionLinesSnapshotsEqual(
  left: VersionLinesSnapshot | null,
  right: VersionLinesSnapshot | null,
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
    left.lines.length !== right.lines.length
  ) {
    return false;
  }
  return left.lines.every((line, index) => {
    const other = right.lines[index];
    return (
      line.name === other.name &&
      line.tip.commit === other.tip.commit &&
      line.tip.shortCommit === other.tip.shortCommit &&
      line.tip.subject === other.tip.subject &&
      line.tip.committedAt === other.tip.committedAt &&
      line.isActive === other.isActive &&
      line.upstream === other.upstream &&
      line.isRetainedElsewhere === other.isRetainedElsewhere &&
      line.uniqueCommitCount === other.uniqueCommitCount &&
      line.worktreePath === other.worktreePath &&
      line.upstreamAhead === other.upstreamAhead &&
      line.upstreamBehind === other.upstreamBehind &&
      line.upstreamGone === other.upstreamGone
    );
  });
}
