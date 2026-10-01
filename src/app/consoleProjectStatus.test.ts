import { describe, expect, it } from "vitest";
import type { WorkingTreeStatus } from "../features/status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncState, type TeamSyncStatus } from "../features/sync";
import { consoleProjectStatus } from "./consoleProjectStatus";

const tree = { counts: { total: 3 }, lineTotals: { added: 12, removed: 4 } } as unknown as WorkingTreeStatus;
const sync = (state: TeamSyncState, ahead: number, behind = 0) => ({
  ...EMPTY_TEAM_SYNC_STATE,
  status: { state, ahead, behind } as unknown as TeamSyncStatus,
});

describe("consoleProjectStatus", () => {
  it("reports known changes and a current comparison with the remote copy", () => {
    expect(consoleProjectStatus(tree, false, null, sync("diverged", 2, 1))).toEqual({
      changes: 3, linesAdded: 12, linesRemoved: 4, unpublished: 2, incoming: 1,
    });
  });

  it("does not read zeros as up to date when the line was never compared", () => {
    for (const state of ["noRemote", "noUpstream", "unborn", "detached", "unknown"] as const) {
      const status = consoleProjectStatus(tree, false, null, sync(state, 0));
      expect(status.unpublished, state).toBeNull();
      expect(status.incoming, state).toBeNull();
    }
    expect(consoleProjectStatus(tree, false, null, sync("upToDate", 0)).unpublished).toBe(0);
  });

  it("leaves out facts that are still loading, failed or may be stale", () => {
    const checking = { ...sync("ahead", 5), isCheckingRemote: true };
    const stale = { ...sync("ahead", 5), isStale: true };
    expect(consoleProjectStatus(tree, true, null, checking)).toMatchObject({ changes: null, unpublished: null });
    expect(consoleProjectStatus(tree, false, "failed", stale)).toMatchObject({ changes: null, linesAdded: 0, unpublished: null });
  });
});
