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

/** What the publish dialog can say before the remote has been checked: the
 * parts of a `PublishPlan` its summary draws. A fresh `PublishPlan` is one;
 * so is `previewFromPendingVersions`'s answer, read from what the session
 * already holds. */
export type PublishPreview = Pick<
  PublishPlan,
  "target" | "commitCount" | "commitSummary" | "remainingAfterPublish" | "hasUnsavedFiles"
>;

/** A first answer for the publish dialog from the session's cached pending
 * list, shown while the fresh plan's fetch is out. It reflects the remote as
 * of the last fetch, so it is only ever a preview: the dialog holds Publish
 * back until the fresh plan replaces it, and that plan decides.
 *
 * `null` whenever the cache can't stand for the plan:
 * - no upstream — the pending list then counts every local version, and the
 *   destination isn't known until Rust resolves the remote;
 * - nothing pending, or the list failed;
 * - `upTo` names a version the list doesn't hold. */
export function previewFromPendingVersions({
  pending,
  pendingError,
  upstream,
  hasUnsavedFiles,
  upTo,
}: {
  pending: PendingVersionsResult;
  pendingError: string | null;
  /** `remote/branch`, as `git status` reports the tracked branch. */
  upstream: string | null;
  hasUnsavedFiles: boolean;
  upTo?: string;
}): PublishPreview | null {
  if (pendingError || !upstream || pending.totalCount === 0 || pending.versions.length === 0) {
    return null;
  }
  const separator = upstream.indexOf("/");
  if (separator <= 0 || separator === upstream.length - 1) {
    return null;
  }
  const target = {
    remote: upstream.slice(0, separator),
    destinationBranch: upstream.slice(separator + 1),
  };
  // Newest first: everything before the checkpoint stays unpublished.
  const start = upTo === undefined ? 0 : pending.versions.findIndex((version) => version.commit === upTo);
  if (start < 0) {
    return null;
  }
  return {
    target,
    commitCount: pending.totalCount - start,
    commitSummary: pending.versions.slice(start),
    remainingAfterPublish: start,
    hasUnsavedFiles,
  };
}
