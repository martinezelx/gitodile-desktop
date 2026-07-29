import type { ChangeCategory } from "./repositoryOverview";

/** Mirrors the Rust `RemoteInfo` contract. The url is already redacted on
 * the Rust side; nothing here should ever see embedded credentials. */
export type RemoteInfo = {
  name: string;
  url: string;
};

export type RemoteDiscovery = {
  remotes: RemoteInfo[];
  branch: string | null;
  upstream: string | null;
};

export type PublishTarget = {
  remote: string;
  destinationBranch: string;
};

/** Mirrors the Rust `PublishPlan` contract. */
export type PublishPlan = {
  operationKind: "remote-mutation";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  target: PublishTarget;
  localBranch: string;
  willCreateUpstream: boolean;
  commitCount: number;
  commitSummary: SavedVersionSummary[];
  hasUnsavedFiles: boolean;
  /** How many more pending saved versions would still remain unpublished
   * after this plan — always `0` unless a checkpoint (`upTo`) short of the
   * newest pending version was requested. */
  remainingAfterPublish: number;
  remainingCommitSummary: SavedVersionSummary[];
};

/** Mirrors the Rust `PublishResult` contract. */
export type PublishResult = {
  target: PublishTarget;
  localBranch: string;
  previousRemoteCommit: string | null;
  publishedCommit: string;
  publishedCount: number;
  createdUpstream: boolean;
  remainingAfterPublish: number;
};

/** Mirrors the Rust `SavedVersionSummary` contract returned by
 * `list_unpublished_versions` — read-only and local-only, never a fresh
 * remote preflight. See that command's doc comment for the exact caveat. */
export type SavedVersionSummary = {
  commit: string;
  shortCommit: string;
  title: string;
  description: string | null;
};

export type PendingVersionsResult = {
  totalCount: number;
  versions: SavedVersionSummary[];
  isTruncated: boolean;
};

/** Mirrors the Rust `CommitFileChange` contract returned by
 * `read_commit_file_changes` — the same `ChangeCategory` vocabulary (and, on
 * screen, the same icons) as the working-tree Changes list. */
export type CommitFileChange = {
  path: string;
  originalPath: string | null;
  category: ChangeCategory;
};
