import type { ProjectRuntimeSnapshot } from "../../projectRuntime";

export type RemoteInfo = {
  name: string;
  /** Already redacted by Rust. Raw configured URLs never cross IPC. */
  url: string;
};

export type RemoteDiscovery = {
  remotes: RemoteInfo[];
  branch: string | null;
  upstream: string | null;
};

export type SyncTarget = {
  remote: string;
  destinationBranch: string;
};

export type TeamSyncState =
  | "noRemote"
  | "noUpstream"
  | "unborn"
  | "detached"
  | "upToDate"
  | "ahead"
  | "behind"
  | "diverged"
  | "unknown";

export type SyncKnowledge = "cached" | "fresh";
export type SyncNextAction = "checkAgain" | "publishChanges" | "reviewAndGet";

export type SyncWarning = {
  code: string;
  message: string;
};

export type TeamSyncStatus = {
  state: TeamSyncState;
  localBranch: string | null;
  localCommit: string | null;
  upstreamRemote: string | null;
  destinationBranch: string | null;
  trackingRef: string | null;
  remoteCommit: string | null;
  ahead: number;
  behind: number;
  knowledge: SyncKnowledge;
  checkedAt: number | null;
  warnings: SyncWarning[];
  nextActions: SyncNextAction[];
  stateToken: string;
};

export type GetTeamChangesPhase =
  | "checkingTeam"
  | "checkingLocalSafety"
  | "creatingRecovery"
  | "updatingFilesAndHistory"
  | "verifying";

export type IncomingFileCategory = "added" | "modified" | "deleted" | "renamed";

export type IncomingFile = {
  path: string;
  originalPath: string | null;
  category: IncomingFileCategory;
  binary: boolean;
};

export type IncomingFileImpact = {
  totalCount: number;
  counts: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    binary: number;
  };
  files: IncomingFile[];
  isTruncated: boolean;
};

export type IncomingVersionSummary = {
  commit: string;
  shortCommit: string;
  title: string;
  description: string | null;
  committedAt: string;
  author: string;
};

export type HistoryRecoveryPreview = {
  reference: string;
  explanation: string;
  retention: string;
  retentionLimit: number;
};

export type HistoryRecoveryRecord = {
  schemaVersion: number;
  recoveryId: string;
  reference: string;
  createdAtMs: number;
  operation: "get-team-changes";
  ownerId: string;
  branch: string;
  previousCommit: string;
  targetCommit: string;
  remote: string;
  destinationBranch: string;
  trackingRef: string;
  stateToken: string;
  retentionLimit: number;
};

export type GetTeamChangesPlan = {
  operationKind: "history-mutation";
  requiresConfirmation: true;
  projectId: string;
  sessionEpoch: string;
  stateToken: string;
  branch: string;
  target: SyncTarget;
  trackingRef: string;
  localCommit: string;
  remoteCommit: string;
  incomingCount: number;
  incomingVersions: IncomingVersionSummary[];
  versionsTruncated: boolean;
  fileImpact: IncomingFileImpact;
  consequences: string[];
  risks: string[];
  steps: string[];
  verification: string;
  recovery: HistoryRecoveryPreview;
  guarantees: {
    fastForwardOnly: true;
    noMerge: true;
    noRebase: true;
    noStash: true;
    noForce: true;
    noAutomaticConflictResolution: true;
  };
};

export type GetTeamChangesResult = {
  outcome: "completed" | "uncertain";
  projectId: string;
  sessionEpoch: string;
  branch: string;
  target: SyncTarget;
  trackingRef: string;
  previousCommit: string;
  resultingCommit: string | null;
  observedHead: string | null;
  receivedCount: number;
  recovery: HistoryRecoveryRecord;
  syncStatus: TeamSyncStatus | null;
  warnings: SyncWarning[];
  inspectionInstructions: string | null;
};

export type TeamSyncViewState = {
  status: TeamSyncStatus | null;
  isLoading: boolean;
  isCheckingRemote: boolean;
  isStale: boolean;
  error: string | null;
  generation: number;
  /** Session-only evidence. It is never part of project persistence. */
  lastSuccessfulCheckAt: number | null;
};

export const EMPTY_TEAM_SYNC_STATE: TeamSyncViewState = {
  status: null,
  isLoading: false,
  isCheckingRemote: false,
  isStale: false,
  error: null,
  generation: 0,
  lastSuccessfulCheckAt: null,
};

export function teamSyncFactsEqual(
  left: TeamSyncStatus | null,
  right: TeamSyncStatus | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.state === right.state &&
    left.localBranch === right.localBranch &&
    left.localCommit === right.localCommit &&
    left.upstreamRemote === right.upstreamRemote &&
    left.destinationBranch === right.destinationBranch &&
    left.trackingRef === right.trackingRef &&
    left.remoteCommit === right.remoteCommit &&
    left.ahead === right.ahead &&
    left.behind === right.behind &&
    left.stateToken === right.stateToken &&
    left.warnings.length === right.warnings.length &&
    left.warnings.every(
      (warning, index) =>
        warning.code === right.warnings[index]?.code &&
        warning.message === right.warnings[index]?.message,
    )
  );
}

export function teamSyncStatusesEqual(
  left: TeamSyncStatus | null,
  right: TeamSyncStatus | null,
): boolean {
  if (left === right) return true;
  return (
    teamSyncFactsEqual(left, right) &&
    left?.knowledge === right?.knowledge &&
    left?.checkedAt === right?.checkedAt &&
    left?.nextActions.length === right?.nextActions.length &&
    Boolean(left?.nextActions.every((action, index) => action === right?.nextActions[index]))
  );
}

export function selectTeamSyncState(
  snapshot: ProjectRuntimeSnapshot,
  projectId: string | null,
): TeamSyncViewState {
  return projectId ? (snapshot.byId[projectId]?.teamSync ?? EMPTY_TEAM_SYNC_STATE) : EMPTY_TEAM_SYNC_STATE;
}
