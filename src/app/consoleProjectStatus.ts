import type { ConsoleProjectStatus } from "../features/console";
import type { WorkingTreeStatus } from "../features/status";
import type { TeamSyncState, TeamSyncViewState } from "../features/sync";

/** Sync states in which the line was compared against its remote copy. */
const COMPARED_SYNC_STATES: ReadonlySet<TeamSyncState> = new Set<TeamSyncState>(["upToDate", "ahead", "behind", "diverged"]);

/**
 * The status bar's facts for the console's own status line, which stands in
 * for the bar on that screen. Changes count only once they are known, and
 * remote counts only from a check that actually compared the line: with no
 * remote, no upstream, no commit yet or a detached head, Git reports zeros
 * that would otherwise read as "up to date". A re-check in flight keeps the
 * last known facts, so a watched edit does not blank the welcome's rows and
 * shift the screen; a failed or stale reading clears them.
 */
export function consoleProjectStatus(
  workingTree: WorkingTreeStatus | null,
  workingTreeError: string | null,
  teamSync: TeamSyncViewState,
): ConsoleProjectStatus {
  const knownTree = workingTree && !workingTreeError ? workingTree : null;
  const current = !teamSync.error && !teamSync.isStale ? teamSync.status : null;
  const remote = current && COMPARED_SYNC_STATES.has(current.state) ? current : null;
  return {
    changes: knownTree ? knownTree.counts.total : null,
    linesAdded: knownTree?.lineTotals?.added ?? 0,
    linesRemoved: knownTree?.lineTotals?.removed ?? 0,
    unpublished: remote ? remote.ahead : null,
    incoming: remote ? remote.behind : null,
  };
}
