import { describe, expect, it } from "vitest";

import { createProjectRuntime } from "../../runtime/project/runtime";
import { initialProjectSessionsState } from "../../runtime/project/sessions";
import type { RepositoryInfo } from "../repository";
import { createSyncController } from "./controller";
import type { TeamSyncStatus } from "./domain";
import type { SyncPort } from "./port";

const project = (epoch: string): RepositoryInfo => ({
  name: "repo", path: "/repo", selectedPath: "/repo", gitDir: "/repo/.git",
  commonGitDir: "/repo/.git", branch: "main", headState: "branch",
  kind: "repository", sessionEpoch: epoch,
});

const status = (knowledge: "cached" | "fresh", ahead = 0): TeamSyncStatus => ({
  state: ahead ? "ahead" : "upToDate",
  localBranch: "main",
  localCommit: "abc",
  upstreamRemote: "origin",
  destinationBranch: "main",
  trackingRef: "refs/remotes/origin/main",
  remoteCommit: "def",
  ahead,
  behind: 0,
  knowledge,
  checkedAt: knowledge === "fresh" ? 123 : null,
  warnings: [],
  nextActions: ahead ? ["publishChanges"] : ["checkAgain"],
  stateToken: `token-${ahead}`,
});

const readPort = (implementation: Pick<SyncPort, "readLocal" | "check">): SyncPort => ({
  ...implementation,
  planGet: async () => { throw new Error("not used"); },
  get: async () => { throw new Error("not used"); },
});

describe("sync controller", () => {
  it("uses only the local port for activation and invalidation warming", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = createProjectRuntime(initialProjectSessionsState, (task) => {
      scheduled.push(task);
      return () => undefined;
    });
    runtime.dispatch({ type: "open", project: project("epoch-1") });
    let localReads = 0;
    let networkChecks = 0;
    const controller = createSyncController(readPort({
      readLocal: async () => { localReads += 1; return status("cached"); },
      check: async () => { networkChecks += 1; return status("fresh"); },
    }));
    controller.scheduleWarm(
      runtime,
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      "project-activation",
      () => "failed",
    );
    expect(networkChecks).toBe(0);
    scheduled[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(localReads).toBe(1);
    expect(networkChecks).toBe(0);
  });

  it("does not flash a stale warning while activation refreshes local knowledge", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = createProjectRuntime(initialProjectSessionsState, (task) => {
      scheduled.push(task);
      return () => undefined;
    });
    runtime.dispatch({ type: "open", project: project("epoch-1") });
    let resolveLocal!: (value: TeamSyncStatus) => void;
    const controller = createSyncController(readPort({
      readLocal: () => new Promise((resolve) => { resolveLocal = resolve; }),
      check: async () => status("fresh"),
    }));
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.check(runtime, query, () => "failed");

    controller.scheduleWarm(runtime, query, "project-activation", () => "failed");
    scheduled[0]?.();
    expect(runtime.getSnapshot().byId["/repo"].teamSync.isLoading).toBe(true);
    expect(runtime.getSnapshot().byId["/repo"].teamSync.isStale).toBe(false);

    resolveLocal(status("cached"));
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.getSnapshot().byId["/repo"].teamSync.isStale).toBe(false);
  });

  it("coalesces equivalent checks and keeps fresh session evidence through the local follow-up", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: project("epoch-1") });
    let resolveCheck!: (value: TeamSyncStatus) => void;
    let checks = 0;
    const controller = createSyncController(readPort({
      readLocal: async () => status("cached"),
      check: () => {
        checks += 1;
        return new Promise((resolve) => { resolveCheck = resolve; });
      },
    }));
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const first = controller.check(runtime, query, () => "failed");
    const second = controller.check(runtime, query, () => "failed");
    expect(first).toBe(second);
    expect(checks).toBe(1);
    resolveCheck(status("fresh"));
    await first;
    await controller.refreshLocal(runtime, query, () => "failed");
    expect(runtime.getSnapshot().byId["/repo"].teamSync.status?.knowledge).toBe("fresh");
    expect(runtime.getSnapshot().byId["/repo"].teamSync.lastSuccessfulCheckAt).toBe(123);
  });

  it("keeps the last truthful result visible after a failed explicit check", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: project("epoch-1") });
    let fail = false;
    const controller = createSyncController(readPort({
      readLocal: async () => status("cached", 1),
      check: async () => {
        if (fail) throw new Error("offline");
        return status("fresh", 1);
      },
    }));
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.check(runtime, query, () => "Could not connect");
    fail = true;
    await controller.check(runtime, query, () => "Could not connect");
    const state = runtime.getSnapshot().byId["/repo"].teamSync;
    expect(state.status?.state).toBe("ahead");
    expect(state.error).toBe("Could not connect");
    expect(state.isStale).toBe(true);
  });

  it("rejects a late response after close and reopen of the same path", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: project("old") });
    let resolveOld!: (value: TeamSyncStatus) => void;
    const controller = createSyncController(readPort({
      readLocal: ({ sessionEpoch }) => sessionEpoch === "old"
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(status("cached", 2)),
      check: async () => status("fresh"),
    }));
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const oldRequest = controller.refreshLocal(runtime, oldQuery, () => "failed");
    controller.close(runtime, oldQuery);
    runtime.dispatch({ type: "close", id: "/repo" });
    runtime.dispatch({ type: "open", project: project("new") });
    await controller.refreshLocal(runtime, { projectId: "/repo", sessionEpoch: "new" }, () => "failed");
    resolveOld(status("cached", 9));
    await oldRequest;
    expect(runtime.getSnapshot().byId["/repo"].epoch).toBe("new");
    expect(runtime.getSnapshot().byId["/repo"].teamSync.status?.ahead).toBe(2);
  });

  it("marks a fresh result stale when a mutation supersedes it", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: project("epoch-1") });
    const controller = createSyncController(readPort({
      readLocal: async () => status("cached"),
      check: async () => status("fresh"),
    }));
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.check(runtime, query, () => "failed");
    controller.supersede(runtime, query);
    expect(runtime.getSnapshot().byId["/repo"].teamSync.isStale).toBe(true);
  });
});
