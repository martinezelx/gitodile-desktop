import type { HeadState } from "../repository";

/** Mirrors the Rust `BranchTip` contract. */
export type BranchTip = {
  commit: string;
  shortCommit: string;
  subject: string;
  /** ISO 8601 (`committerdate:iso-strict`). */
  committedAt: string;
};

/** Mirrors the Rust `Branch` contract — one local branch as reported by
 * the read-only, local-only discovery command. */
export type Branch = {
  name: string;
  tip: BranchTip;
  isActive: boolean;
  upstream: string | null;
  /** Whether this branch's exact tip is reachable from another retained local
   * or remote-tracking ref — the same proof required before deletion. Based
   * only on locally known refs; never a fresh remote check. */
  isRetainedElsewhere: boolean;
  /** Its work is on the project's main branch and was its own: merged, with
   * a version saved on it, a merge that brought it in, or its remote branch
   * deleted. What "Ready to clean up" offers. Not the same as
   * `isRetainedElsewhere`, which a published branch in progress also is. */
  isFinished: boolean;
  /** Commits unique to this branch relative to the active one, when
   * meaningful (never set for the active branch itself). */
  /** Versions on this branch and not on the project's main branch (the remote's
   * default) — the branch the detail's route is drawn against. `null` for the
   * main branch itself, and in a project with no main branch. */
  uniqueCommitCount: number | null;
  /** Set when this branch is checked out in a different linked worktree —
   * this window cannot switch to or delete it. */
  worktreePath: string | null;
  /** Commits on this branch not yet on `upstream`. `null` when there is no
   * upstream; `0` means fully pushed. Reflects the last local fetch, not a
   * live remote check. */
  upstreamAhead: number | null;
  /** Commits on `upstream` not yet on this branch. Same `null`/`0` convention
   * as `upstreamAhead`. */
  upstreamBehind: number | null;
  /** The configured upstream branch was deleted on the remote. `upstream`
   * stays set (it names what's missing); `upstreamAhead`/`upstreamBehind`
   * are meaningless in this state. */
  upstreamGone: boolean;
  /** This is a remote's default branch. Deleting or renaming it is refused, and
   * the screen doesn't offer either. */
  isDefault: boolean;
};

/** Mirrors the Rust `BranchesSnapshot` contract. */
export type BranchesSnapshot = {
  branch: string | null;
  headState: HeadState;
  currentCommit: string | null;
  branches: Branch[];
  totalCount: number;
  isTruncated: boolean;
  /** Local branches whose exact bytes GitOdile can't represent, and which
   * are therefore missing from `branches`. Reported rather than lossily
   * converted, so the screen can say the list is incomplete instead of
   * offering a name that doesn't exist. */
  unreadableCount: number;
};

/** The snapshot with the active branch marked gone when the sync status says
 * so of that same branch. The same object when nothing changes, so a memoised
 * panel does not redraw. */
export function withActiveBranchGone(
  snapshot: BranchesSnapshot | null,
  goneBranch: string | null,
): BranchesSnapshot | null {
  const marks = (branch: Branch): boolean =>
    branch.isActive && branch.name === goneBranch && branch.upstream !== null && !branch.upstreamGone;
  if (!snapshot || goneBranch === null || !snapshot.branches.some(marks)) return snapshot;
  return {
    ...snapshot,
    branches: snapshot.branches.map((branch) => (marks(branch) ? { ...branch, upstreamGone: true } : branch)),
  };
}

/** Mirrors the Rust `BranchVersion` contract — one saved version on a
 * branch, as read by the on-demand history call. */
export type BranchVersion = {
  commit: string;
  shortCommit: string;
  subject: string;
  authorName: string;
  /** ISO 8601, same as `BranchTip.committedAt`. */
  committedAt: string;
};

/** Mirrors the Rust `BranchHistory` contract — the deeper answer for one
 * selected branch, which the inventory deliberately does not carry: reading it
 * for every branch would cost one Git process per branch on every refresh. */
export type BranchHistory = {
  name: string;
  /** Saved versions reachable from this branch's tip. `null` in a shallow
   * clone, where the history this machine holds is not the history that
   * exists. */
  totalCount: number | null;
  versions: BranchVersion[];
  hasMore: boolean;
  /** The listed versions not yet on the branch's upstream, by commit. `null`
   * when the branch tracks nothing or its tracking branch is gone. */
  unpublished: string[] | null;
  /** Where this branch left the project's main branch. `null` for the main branch
   * itself, a project with no main branch, a shallow clone, or when Git could
   * not say. */
  route: BranchRoute | null;
};

/** Mirrors the Rust `BranchRoute` contract — a branch against the
 * project's main branch: where the two parted, the versions each saved while
 * apart, and the merge that brought it back, if one did. Each count comes with
 * up to eight of its versions, newest first, so a drawn dot is a real one. */
export type BranchRoute = {
  base: string;
  forkCommit: string;
  /** ISO 8601, of the version where the two parted. */
  forkedAt: string;
  /** Versions this branch saved away from the main branch — still away, or until
   * it came back. Zero with no `merge`: its versions were always the main
   * branch's own. */
  ownCount: number;
  ownVersions: BranchVersion[];
  /** Versions the main branch saved after the parting — up to the merge, when
   * the branch came back. */
  baseCount: number;
  baseVersions: BranchVersion[];
  merge: BranchMerge | null;
  /** What the branch changes against the main branch since the parting — or what
   * it brought, for a branch that came back. `null` when it never left. */
  changes: BranchChanges | null;
};

/** Mirrors the Rust `BranchChanges` contract: totals over every file the branch
 * changes since the parting. */
export type BranchChanges = {
  filesChanged: number;
  additions: number;
  deletions: number;
};

/** Mirrors the Rust `BranchMerge` contract: the merge by which a branch came
 * back into the main branch, and what the main branch saved after it. */
export type BranchMerge = {
  /** `merge`: the branch's own versions came in. `squash` / `rebase`: copies of
   * them did — one version with their whole change, or one per version — and
   * the originals are still only on the branch. */
  kind: "merge" | "squash" | "rebase";
  /** The main branch's version that brought the work in. */
  commit: string;
  /** ISO 8601. */
  mergedAt: string;
  afterCount: number;
  afterVersions: BranchVersion[];
};

/** Mirrors the Rust `CreateBranchPlan` contract. */
export type CreateBranchPlan = {
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
  /** Whether `startingCommit` is a saved version the user chose rather than
   * wherever the project is standing. The two are previewed differently, and
   * only the first can be somewhere other than `HEAD`. */
  fromSavedVersion: boolean;
  willSwitch: boolean;
  hasUnsavedWork: boolean;
};

/** Mirrors the Rust `SwitchBranchPlan` contract. */
export type SwitchBranchPlan = {
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

/** Mirrors the Rust `PublishedBranch` contract — where a branch is published,
 * read from its own Git configuration rather than by splitting `origin/x`. */
export type PublishedBranch = {
  remote: string;
  branch: string;
  /** `origin/feature-x` — what the rest of the app calls the upstream. */
  shortName: string;
};

/** Mirrors the Rust `DeleteBranchResult` contract. The local half and the
 * remote half can succeed separately, so both are reported. */
export type DeleteBranchResult = {
  snapshot: BranchesSnapshot;
  /** `null` when no remote deletion was asked for. */
  remoteDeleted: boolean | null;
  /** Set when one was asked for and refused. The local branch is gone either
   * way; this says the published copy is not. */
  remoteError: unknown | null;
  /** The recovery point kept before the branch was removed, when its versions
   * were held nowhere else. */
  recoveryReference: string | null;
};

/** Mirrors the Rust `RenameBranchPlan` contract. */
export type RenameBranchPlan = {
  operationKind: "local-mutation";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  name: string;
  newName: string;
  isActive: boolean;
  /** The branch is published under its old name, which a rename doesn't touch. */
  upstream: string | null;
};

/** Mirrors the Rust `DeleteBranchPlan` contract. */
export type DeleteBranchPlan = {
  operationKind: "destructive";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  stateToken: string;
  name: string;
  tipCommit: string;
  /** Exact ref name(s) that keep this branch's tip reachable after deletion. */
  retainedBy: string[];
  upstream: string | null;
  /** The published copy this delete can clear away too, when there is one and
   * it still exists on the remote. */
  published: PublishedBranch | null;
  /** Set when no other branch holds these versions but their work reached the
   * main branch as copies. The delete then keeps `recoveryPoint` first. */
  copiedInto: CopiedInto | null;
  recoveryPoint: RecoveryPointPreview | null;
};

/** Mirrors the Rust `CleanUpBranch` contract: one branch a clean-up will delete. */
export type CleanUpBranch = {
  name: string;
  tipCommit: string;
  /** Exact ref names that hold this branch's tip. */
  retainedBy: string[];
  published: PublishedBranch | null;
  /** This branch's own token, echoed back to delete it. */
  stateToken: string;
};

/** Mirrors the Rust `ExcludedBranch` contract: asked for, left out, and why. */
export type ExcludedBranch = {
  name: string;
  reason: unknown;
};

/** Mirrors the Rust `CleanUpBranchesPlan` contract. */
export type CleanUpBranchesPlan = {
  operationKind: "destructive";
  summary: string;
  steps: string[];
  risks: string[];
  recovery: string;
  requiresConfirmation: boolean;
  branches: CleanUpBranch[];
  excluded: ExcludedBranch[];
  /** How the recovery points are kept; each deleted branch gets its own. */
  recoveryPoint: RecoveryPointPreview;
};

/** Mirrors the Rust `CleanUpBranchResult` contract. A skipped branch is untouched,
 * locally and on the remote; a deleted one may still carry a remote error. */
export type CleanUpBranchResult = {
  name: string;
  outcome: "deleted" | "skipped";
  reason: unknown | null;
  /** `null` when the published copy was not asked for, or there was none. */
  remoteDeleted: boolean | null;
  remoteError: unknown | null;
  recoveryReference: string | null;
};

/** Mirrors the Rust `CleanUpBranchesResult` contract. */
export type CleanUpBranchesResult = {
  /** `null` only when reading the list failed after branches were deleted; the
   * clean-up still happened, and the screen refreshes on its own. */
  snapshot: BranchesSnapshot | null;
  branches: CleanUpBranchResult[];
};

/** Mirrors the Rust `CopiedInto` contract. */
export type CopiedInto = {
  base: string;
  kind: "merge" | "squash" | "rebase";
  commit: string;
};

/** Mirrors the Rust `HistoryRecoveryPreview` contract. */
export type RecoveryPointPreview = {
  reference: string;
  explanation: string;
  retention: string;
  retentionLimit: number;
};
