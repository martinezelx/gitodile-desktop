import { describe, expect, it } from "vitest";

import { createProjectRuntime } from "../../projectRuntime";
import { initialProjectSessionsState } from "../../projectSessions";
import type { RepositoryInfo } from "../repository";
import { createStatusController } from "./controller";
import type { WorkingTreeStatus } from "./domain";

const info = (epoch: string): RepositoryInfo => ({
  name: "repo", path: "/repo", selectedPath: "/repo", gitDir: "/repo/.git", commonGitDir: "/repo/.git",
  branch: "main", headState: "branch", kind: "repository", sessionEpoch: epoch,
});
const status = (total: number): WorkingTreeStatus => ({
  isClean: total === 0,
  counts: { changed: total, new: 0, deleted: 0, renamed: 0, conflicted: 0, total },
  entries: [], truncated: false, hasPreparedChanges: false, hasUnpreparedChanges: total > 0,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
});

describe("status controller", () => {
  it("preserves unchanged working-tree and pending-version identities", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    const controller = createStatusController({
      readWorkingTree: async () => status(1),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.refresh(runtime, query, () => "error");
    const first = runtime.getSnapshot().byId["/repo"];
    await controller.refresh(runtime, query, () => "error");
    const second = runtime.getSnapshot().byId["/repo"];
    expect(second.workingTree).toBe(first.workingTree);
    expect(second.pendingVersions).toBe(first.pendingVersions);
  });

  it("coalesces concurrent refreshes and preserves equal session snapshots", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    let resolveStatus!: (value: WorkingTreeStatus) => void;
    const readWorkingTree = () => new Promise<WorkingTreeStatus>((resolve) => { resolveStatus = resolve; });
    const controller = createStatusController({
      readWorkingTree,
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    }, () => 123);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const first = controller.refresh(runtime, query, () => "error");
    const second = controller.refresh(runtime, query, () => "error");
    expect(first).toBe(second);
    resolveStatus(status(1));
    await first;
    expect(runtime.getSnapshot().byId["/repo"].workingTreeCheckedAt).toBe(123);
  });

  it("rejects a response from a closed epoch after the same path reopens", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("old") });
    let resolveOld!: (value: WorkingTreeStatus) => void;
    const controller = createStatusController({
      readWorkingTree: ({ sessionEpoch }) => sessionEpoch === "old"
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(status(2)),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const oldRequest = controller.refresh(runtime, oldQuery, () => "error");
    controller.close(oldQuery);
    runtime.dispatch({ type: "close", id: "/repo" });
    runtime.dispatch({ type: "open", project: info("new") });
    await controller.refresh(runtime, { projectId: "/repo", sessionEpoch: "new" }, () => "error");
    resolveOld(status(9));
    await oldRequest;
    expect(runtime.getSnapshot().byId["/repo"].epoch).toBe("new");
    expect(runtime.getSnapshot().byId["/repo"].workingTree?.counts.total).toBe(2);
  });
});
