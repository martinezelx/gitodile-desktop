import { describe, expect, it, vi } from "vitest";

import { createProjectRuntime } from "../../runtime/project/runtime";
import { createVersionLinesController } from "./controller";
import type { VersionLinesSnapshot } from "./domain";
import type { VersionLinesPort, VersionLinesQuery } from "./port";

function snapshot(name = "main", commit = "abc123"): VersionLinesSnapshot {
  return {
    branch: name,
    headState: "branch",
    currentCommit: commit,
    lines: [{
      name,
      tip: { commit, shortCommit: commit.slice(0, 7), subject: name, committedAt: "2026-08-09T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      uniqueCommitCount: null,
      worktreePath: null,
      upstreamAhead: null,
      upstreamBehind: null,
      upstreamGone: false,
      isDefault: false,
    }],
    totalCount: 1,
    isTruncated: false,
    unreadableCount: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function port(read: VersionLinesPort["read"]): VersionLinesPort {
  return {
    read,
    readHistory: vi.fn(),
    planCreate: vi.fn(),
    create: vi.fn(),
    planSwitch: vi.fn(),
    switch: vi.fn(),
    planDelete: vi.fn(),
    planRename: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  };
}

const query: VersionLinesQuery = { projectId: "/repo", sessionEpoch: "epoch-1" };

describe("VersionLinesController", () => {
  it("deduplicates one in-flight read per project query", async () => {
    const pending = deferred<VersionLinesSnapshot>();
    const read = vi.fn(() => pending.promise);
    const controller = createVersionLinesController(port(read));
    const first = controller.refresh(query);
    const second = controller.refresh(query);
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    pending.resolve(snapshot());
    await first;
  });

  it("reports progress while refreshing a cached snapshot", async () => {
    const pending = deferred<VersionLinesSnapshot>();
    const controller = createVersionLinesController(port(() => pending.promise));
    controller.commit(query, snapshot());

    const refresh = controller.refresh(query);
    expect(controller.getSnapshot(query).isLoading).toBe(true);
    expect(controller.getSnapshot(query).snapshot).not.toBeNull();
    pending.resolve(snapshot());
    await refresh;
    expect(controller.getSnapshot(query).isLoading).toBe(false);
  });

  it("lets a mutation snapshot supersede an older discovery response", async () => {
    const pending = deferred<VersionLinesSnapshot>();
    const controller = createVersionLinesController(port(() => pending.promise));
    const read = controller.refresh(query);
    const mutation = snapshot("feature/new", "def456");
    controller.commit(query, mutation);
    pending.resolve(snapshot("stale", "000000"));
    await read;
    expect(controller.getSnapshot(query).snapshot).toBe(mutation);
  });

  it("preserves unchanged identity, replaces changed data, and keeps the last snapshot on error", async () => {
    const answers: Array<VersionLinesSnapshot | Error> = [
      snapshot(),
      structuredClone(snapshot()),
      snapshot("feature/changed", "def456"),
      new Error("git blip"),
    ];
    const controller = createVersionLinesController(port(async () => {
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer!;
    }));
    await controller.refresh(query);
    const first = controller.getSnapshot(query).snapshot;
    await controller.refresh(query);
    expect(controller.getSnapshot(query).snapshot).toBe(first);
    await controller.refresh(query);
    const changed = controller.getSnapshot(query).snapshot;
    expect(changed).not.toBe(first);
    await controller.refresh(query);
    expect(controller.getSnapshot(query).snapshot).toBe(changed);
    expect(controller.getSnapshot(query).error).toEqual(new Error("git blip"));
  });

  it("isolates projects and rejects a closed incarnation after the same path reopens", async () => {
    const oldRead = deferred<VersionLinesSnapshot>();
    const newRead = deferred<VersionLinesSnapshot>();
    const other = snapshot("other", "222222");
    const read = vi.fn((request: VersionLinesQuery) => {
      if (request.projectId === "/other") return Promise.resolve(other);
      return request.sessionEpoch === "old" ? oldRead.promise : newRead.promise;
    });
    const controller = createVersionLinesController(port(read));
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const newQuery = { projectId: "/repo", sessionEpoch: "new" };
    const oldPromise = controller.refresh(oldQuery);
    await controller.refresh({ projectId: "/other", sessionEpoch: "other" });
    controller.close(oldQuery);
    const newPromise = controller.refresh(newQuery);
    oldRead.resolve(snapshot("stale", "111111"));
    newRead.resolve(snapshot("fresh", "333333"));
    await Promise.all([oldPromise, newPromise]);
    expect(controller.getSnapshot(newQuery).snapshot?.branch).toBe("fresh");
    expect(controller.getSnapshot({ projectId: "/other", sessionEpoch: "other" }).snapshot).toBe(other);
  });

  it("refreshes only for head/ref and shared-repository invalidations", () => {
    const scheduled: Array<() => void | Promise<void>> = [];
    const runtime = createProjectRuntime(undefined, (task) => {
      scheduled.push(task);
      return () => {};
    });
    const read = vi.fn(async () => snapshot());
    const controller = createVersionLinesController(port(read));
    const event = { projectId: "/repo", sessionEpoch: "epoch-1", sequence: 1 } as const;
    controller.invalidate(runtime, { ...event, kind: "worktree" });
    expect(scheduled).toHaveLength(0);
    controller.invalidate(runtime, { ...event, kind: "head_or_refs" });
    expect(scheduled).toHaveLength(1);
    scheduled.shift()?.();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("bounds inactive project snapshots", () => {
    const controller = createVersionLinesController(port(async () => snapshot()));
    for (let index = 0; index < 20; index += 1) {
      controller.getSnapshot({ projectId: `/repo-${index}`, sessionEpoch: `epoch-${index}` });
    }
    expect(controller.size()).toBeLessThanOrEqual(8);
  });
});
