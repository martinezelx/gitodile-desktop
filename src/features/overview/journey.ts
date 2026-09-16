import type { WorkingTreeStatus } from "../status";
import type { TeamSyncViewState } from "../sync";

/** The three things the app is for, in the order they happen. Overview draws
 * them as one band — change, then save, then publish — so the model is on
 * screen without being explained. */
export type JourneyStepId = "changes" | "save" | "publish";

/**
 * Where the reader is on the way from an edited file to a published
 * version, derived from what the app already knows. Pure data: the band
 * chooses its words and its buttons from this, and this never reads the DOM.
 */
export type Journey = {
  /** The step whose action is the one thing to do now, or `null` when
   * nothing is waiting (everything saved and published, or nothing is known
   * yet). Exactly one accent on the band follows this. */
  activeStep: JourneyStepId | null;
  changes: {
    state: "loading" | "error" | "clean" | "dirty" | "conflicts";
    total: number;
    conflicted: number;
  };
  save: {
    state: "loading" | "done" | "active" | "blocked";
  };
  publish: {
    state:
      | "notChecked"
      | "checking"
      | "upToDate"
      | "ahead"
      | "behind"
      | "diverged"
      | "noRemote"
      | "noUpstream"
      | "detached"
      | "unborn"
      | "unavailable";
    /** Saved versions still only on this computer. From the publish
     * inventory rather than the sync check, so it is right even before a
     * remote has been checked this session. */
    pending: number;
    behind: number;
    /** `origin/main`, when the line has a remote line to compare against. */
    remoteLine: string | null;
    checkedAt: number | null;
    /** A check is running now — with or without an earlier result to keep
     * showing underneath it. */
    isChecking: boolean;
    isStale: boolean;
    isCached: boolean;
    error: string | null;
  };
};

export function deriveJourney({
  workingTree,
  workingTreeError,
  isCheckingChanges,
  pendingVersionsCount,
  teamSync,
}: {
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  pendingVersionsCount: number;
  teamSync: TeamSyncViewState;
}): Journey {
  const changes: Journey["changes"] = !workingTree
    ? isCheckingChanges
      ? { state: "loading", total: 0, conflicted: 0 }
      : workingTreeError
        ? { state: "error", total: 0, conflicted: 0 }
        : { state: "loading", total: 0, conflicted: 0 }
    : workingTree.counts.conflicted > 0
      ? { state: "conflicts", total: workingTree.counts.total, conflicted: workingTree.counts.conflicted }
      : workingTree.counts.total > 0
        ? { state: "dirty", total: workingTree.counts.total, conflicted: 0 }
        : { state: "clean", total: 0, conflicted: 0 };

  const save: Journey["save"] = {
    state:
      changes.state === "loading" || changes.state === "error"
        ? "loading"
        : changes.state === "conflicts"
          ? "blocked"
          : changes.state === "dirty"
            ? "active"
            : "done",
  };

  const status = teamSync.status;
  const remoteLine =
    status?.upstreamRemote && status.destinationBranch
      ? `${status.upstreamRemote}/${status.destinationBranch}`
      : null;
  let publishState: Journey["publish"]["state"];
  if (teamSync.isCheckingRemote && !status) publishState = "checking";
  else if (teamSync.error && !status) publishState = "unavailable";
  else if (!status) publishState = "notChecked";
  else if (status.state === "unknown") publishState = "unavailable";
  else publishState = status.state;
  // The inventory knows about versions the last remote check predates; the
  // check knows about a remote that has moved on. Either alone would leave
  // "up to date" on screen with work waiting underneath it.
  if (publishState === "upToDate" && pendingVersionsCount > 0) publishState = "ahead";

  const publish: Journey["publish"] = {
    state: publishState,
    pending: pendingVersionsCount,
    behind: status?.behind ?? 0,
    remoteLine,
    checkedAt: status?.checkedAt ?? teamSync.lastSuccessfulCheckAt,
    isChecking: teamSync.isCheckingRemote,
    isStale: teamSync.isStale,
    isCached: status?.knowledge === "cached",
    error: teamSync.error,
  };

  let activeStep: JourneyStepId | null = null;
  if (changes.state === "conflicts") activeStep = "changes";
  else if (changes.state === "dirty") activeStep = "save";
  else if (changes.state === "clean") {
    if (publish.state === "ahead" || publish.state === "behind" || publish.state === "diverged") {
      activeStep = "publish";
    }
  }

  return { activeStep, changes, save, publish };
}
