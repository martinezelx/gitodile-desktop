import type { ChangeCategory } from "../status";
import type { SyncTarget } from "../sync";
export type { RemoteDiscovery, RemoteInfo } from "../sync";

export type PublishTarget = SyncTarget;

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
  /** ISO 8601 (`%cI`, git's own strict form) — the same shape and source as
   * `VersionLineTip.committedAt`. */
  committedAt: string;
  /** `%an` — whatever name Git has configured for the commit's author. Can be
   * empty on a malformed/legacy commit; render nothing rather than a blank
   * chip when it is. */
  author: string;
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
