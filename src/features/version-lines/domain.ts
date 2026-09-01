import type { HeadState } from "../repository";

/** Mirrors the Rust `VersionLineTip` contract. */
export type VersionLineTip = {
  commit: string;
  shortCommit: string;
  subject: string;
  /** ISO 8601 (`committerdate:iso-strict`). */
  committedAt: string;
};

/** Mirrors the Rust `VersionLine` contract — one local branch as reported by
 * the read-only, local-only discovery command. */
export type VersionLine = {
  name: string;
  tip: VersionLineTip;
  isActive: boolean;
  upstream: string | null;
  /** Whether this line's exact tip is reachable from another retained local
   * or remote-tracking ref — the same proof required before deletion. Based
   * only on locally known refs; never a fresh remote check. */
  isRetainedElsewhere: boolean;
  /** Commits unique to this line relative to the active one, when
   * meaningful (never set for the active line itself). */
  uniqueCommitCount: number | null;
  /** Set when this line is checked out in a different linked worktree —
   * this window cannot switch to or delete it. */
  worktreePath: string | null;
  /** Commits on this line not yet on `upstream`. `null` when there is no
   * upstream; `0` means fully pushed. Reflects the last local fetch, not a
   * live remote check. */
  upstreamAhead: number | null;
  /** Commits on `upstream` not yet on this line. Same `null`/`0` convention
   * as `upstreamAhead`. */
  upstreamBehind: number | null;
  /** The configured upstream branch was deleted on the remote. `upstream`
   * stays set (it names what's missing); `upstreamAhead`/`upstreamBehind`
   * are meaningless in this state. */
  upstreamGone: boolean;
};

/** Mirrors the Rust `VersionLinesSnapshot` contract. */
export type VersionLinesSnapshot = {
  branch: string | null;
  headState: HeadState;
  currentCommit: string | null;
  lines: VersionLine[];
  totalCount: number;
  isTruncated: boolean;
  /** Local branches whose exact bytes GitOdile can't represent, and which
   * are therefore missing from `lines`. Reported rather than lossily
   * converted, so the screen can say the list is incomplete instead of
   * offering a name that doesn't exist. */
  unreadableCount: number;
};

/** Mirrors the Rust `CreateVersionLinePlan` contract. */
export type CreateVersionLinePlan = {
  operationKind: "local-mutation";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  name: string;
  headState: HeadState;
  startingCommit: string | null;
  willSwitch: boolean;
  hasUnsavedWork: boolean;
};

/** Mirrors the Rust `SwitchVersionLinePlan` contract. */
export type SwitchVersionLinePlan = {
  operationKind: "local-mutation";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  from: string;
  to: string;
  fromCommit: string;
  toCommit: string;
  /** Bounded (at most 50) sample of paths that differ between the two tips. */
  changedFiles: string[];
  changedFilesTotal: number;
};

/** Mirrors the Rust `DeleteVersionLinePlan` contract. */
export type DeleteVersionLinePlan = {
  operationKind: "destructive";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  name: string;
  tipCommit: string;
  /** Exact ref name(s) that keep this line's tip reachable after deletion. */
  retainedBy: string[];
  upstream: string | null;
};
