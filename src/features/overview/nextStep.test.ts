import { describe, expect, it } from "vitest";

import type { WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncStatus, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { deriveNextStep } from "./nextStep";

function tree(counts: Partial<WorkingTreeStatus["counts"]>): WorkingTreeStatus {
  const full = { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0, ...counts };
  return {
    isClean: full.total === 0,
    counts: full,
    lineTotals: null,
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: full.total > 0,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
  };
}

function sync(overrides: Partial<TeamSyncStatus> = {}, view: Partial<TeamSyncViewState> = {}): TeamSyncViewState {
  return {
    ...EMPTY_TEAM_SYNC_STATE,
    status: {
      state: "upToDate",
      localBranch: "main",
      localCommit: "1".repeat(40),
      upstreamRemote: "origin",
      destinationBranch: "main",
      trackingRef: "refs/remotes/origin/main",
      remoteCommit: "1".repeat(40),
      ahead: 0,
      behind: 0,
      knowledge: "fresh",
      checkedAt: 1_000,
      warnings: [],
      nextActions: [],
      stateToken: "token",
      ...overrides,
    },
    ...view,
  };
}

function next(
  input: Partial<Parameters<typeof deriveJourney>[0]>,
  canPublish = true,
): ReturnType<typeof deriveNextStep> {
  const journey = deriveJourney({
    workingTree: tree({}),
    workingTreeError: null,
    isCheckingChanges: false,
    pendingVersionsCount: 0,
    teamSync: sync(),
    ...input,
  });
  return deriveNextStep(journey, { canPublish });
}

describe("deriveNextStep", () => {
  it("asks to save unsaved work, in the unsaved colour, before anything remote", () => {
    const step = next({ workingTree: tree({ changed: 3, total: 3 }), pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(step).toMatchObject({ kind: "save", tone: "unsaved", primary: "save", secondary: ["reviewChanges"] });
    expect(step.progress).toEqual({ done: 1, current: 1 });
  });

  it("puts overlapping changes first, as a blocked step with no way round it", () => {
    const step = next({ workingTree: tree({ changed: 1, conflicted: 2, total: 3 }) });
    expect(step).toMatchObject({ kind: "conflicts", tone: "blocked", primary: "resolve", secondary: [] });
    expect(step.progress.current).toBe(0);
  });

  it("offers to publish saved versions in the accent, and only when publishing is possible", () => {
    const ready = next({ pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(ready).toMatchObject({ kind: "publish", tone: "ready", primary: "publish" });
    expect(ready.progress).toEqual({ done: 2, current: 2 });

    const blocked = next({ pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) }, false);
    expect(blocked).toMatchObject({ kind: "unpublished", tone: "ready", primary: null });
  });

  it("brings newer remote versions in, in the incoming colour", () => {
    expect(next({ teamSync: sync({ state: "behind", behind: 3 }) })).toMatchObject({
      kind: "behind",
      tone: "incoming",
      primary: "getChanges",
    });
    expect(next({ teamSync: sync({ state: "diverged", ahead: 1, behind: 1 }) })).toMatchObject({
      kind: "diverged",
      tone: "incoming",
    });
  });

  it("goes quiet when everything is saved and published, leaving the check to the facts column", () => {
    const step = next({});
    expect(step).toMatchObject({ kind: "upToDate", tone: "calm", primary: null, secondary: [] });
    expect(step.progress).toEqual({ done: 3, current: null });
  });

  it("reports what it cannot act on yet without inventing an action", () => {
    expect(next({ workingTree: null, isCheckingChanges: true })).toMatchObject({ kind: "loading", isPending: true, primary: null });
    expect(next({ workingTree: null, workingTreeError: "denied" })).toMatchObject({ kind: "localError", tone: "blocked", primary: "checkLocal" });
    expect(next({ teamSync: sync({ state: "noRemote", upstreamRemote: null }) })).toMatchObject({
      kind: "noRemote",
      primary: null,
      secondary: ["openSettings"],
    });
    // The remote side not read yet holds the card's shape, even with changes.
    expect(next({ teamSync: EMPTY_TEAM_SYNC_STATE })).toMatchObject({ kind: "loading", primary: null });
    expect(next({ workingTree: tree({ changed: 1, total: 1 }), teamSync: EMPTY_TEAM_SYNC_STATE })).toMatchObject({ kind: "loading" });
    expect(next({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, generation: 1 } })).toMatchObject({ kind: "notChecked", secondary: ["checkRemote"] });
  });

  it("keeps the card on saving while saying what comes after, in one pill", () => {
    const behind = next({ workingTree: tree({ changed: 2, total: 2 }), teamSync: sync({ state: "behind", behind: 3 }) });
    expect(behind).toMatchObject({ kind: "save", tone: "unsaved", then: { kind: "get", count: 3 } });

    const ahead = next({ workingTree: tree({ changed: 2, total: 2 }), pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(ahead.then).toEqual({ kind: "publish", count: 2 });

    // What waits on the remote comes first: it has to arrive before anything
    // can be published.
    const both = next({
      workingTree: tree({ changed: 2, total: 2 }),
      pendingVersionsCount: 2,
      teamSync: sync({ state: "diverged", ahead: 2, behind: 3 }),
    });
    expect(both.then).toEqual({ kind: "get", count: 3 });
    expect(next({ workingTree: tree({ changed: 2, total: 2 }) }).then).toBeNull();
  });

  it("asks to receive first when both sides moved, then to publish", () => {
    expect(next({ pendingVersionsCount: 2, teamSync: sync({ state: "diverged", ahead: 2, behind: 3 }) })).toMatchObject({
      kind: "diverged",
      tone: "incoming",
      primary: "getChanges",
      then: { kind: "publish", count: 2 },
    });
  });

  it("names the first save, keeps a failed check calm, and offers a way back from an older version", () => {
    expect(next({ workingTree: tree({ new: 12, total: 12 }), teamSync: sync({ state: "unborn" }) })).toMatchObject({
      kind: "firstSave",
      primary: "save",
    });
    expect(next({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, error: "offline" } })).toMatchObject({
      kind: "unavailable",
      tone: "calm",
      secondary: ["checkRemote"],
    });
    expect(next({ teamSync: sync({ state: "detached" }) })).toMatchObject({ kind: "detached", secondary: ["openLines"] });
  });
});
