import { describe, expect, it, vi } from "vitest";

import type { DiscardRecoveryRecord } from "../changes";
import { createWorkDetailController, newestRestorableDiscard, WORK_DETAIL_COMMIT_LIMIT } from "./workDetail";

const query = { projectId: "/repo", sessionEpoch: "epoch" };

describe("work detail controller", () => {
  it("reads each unpublished version's files once, and only up to the limit", async () => {
    const readCommitFileChanges = vi.fn(async ({ commit }: { commit: string }) => [
      { path: `${commit}.ts`, originalPath: null, category: "changed" as const },
    ]);
    const controller = createWorkDetailController({ readCommitFileChanges, findRestorableDiscard: vi.fn(), readIncomingVersions: vi.fn() });
    const commits = Array.from({ length: WORK_DETAIL_COMMIT_LIMIT + 5 }, (_, index) => `c${index}`);

    await controller.ensureCommitFiles(query, commits);
    expect(readCommitFileChanges).toHaveBeenCalledTimes(WORK_DETAIL_COMMIT_LIMIT);
    expect(controller.getSnapshot(query).commitFiles.get("c0")).toEqual({
      status: "ready",
      files: [{ path: "c0.ts", originalPath: null, category: "changed" }],
    });

    // A saved version never changes: asking again reads nothing.
    await controller.ensureCommitFiles(query, commits);
    expect(readCommitFileChanges).toHaveBeenCalledTimes(WORK_DETAIL_COMMIT_LIMIT);
  });

  it("retries a version whose files could not be read", async () => {
    const readCommitFileChanges = vi
      .fn()
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValueOnce([]);
    const controller = createWorkDetailController({ readCommitFileChanges, findRestorableDiscard: vi.fn(), readIncomingVersions: vi.fn() });

    await controller.ensureCommitFiles(query, ["c0"]);
    expect(controller.getSnapshot(query).commitFiles.get("c0")).toEqual({ status: "error" });
    await controller.ensureCommitFiles(query, ["c0"]);
    expect(controller.getSnapshot(query).commitFiles.get("c0")).toEqual({ status: "ready", files: [] });
  });

  it("keeps the newest restorable discard, and offers none when there is none to read", async () => {
    const recovery = { recoveryId: "r1", createdAtMs: 1, fileCount: 3, restorableCount: 1 };
    const findRestorableDiscard = vi.fn().mockResolvedValueOnce(recovery).mockRejectedValueOnce(new Error("none"));
    const controller = createWorkDetailController({ readCommitFileChanges: vi.fn(), findRestorableDiscard, readIncomingVersions: vi.fn() });
    const listener = vi.fn();
    controller.subscribe(query, listener);

    await controller.refreshRecovery(query);
    expect(controller.getSnapshot(query).recovery).toEqual(recovery);
    await controller.refreshRecovery(query);
    expect(controller.getSnapshot(query).recovery).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("offers the newest discard that can be restored, not merely the newest one", () => {
    const record = (recoveryId: string, availability: DiscardRecoveryRecord["availability"]): DiscardRecoveryRecord => ({
      recoveryId, createdAtMs: 1, fileCount: 2, selectedPath: null, previewPaths: [], stateToken: null, availability, restoresPreparedState: false,
    });

    // Restored or moved past, the newest copy is still stored; an older one
    // the project still matches is the one to offer, counted with the rest
    // the picker could restore.
    expect(newestRestorableDiscard([record("new", "superseded"), record("old", "restorable"), record("older", "restorable")]))
      .toEqual({ recoveryId: "old", createdAtMs: 1, fileCount: 2, restorableCount: 2 });
    expect(newestRestorableDiscard([record("new", "superseded"), record("broken", "incomplete")])).toBeNull();
    expect(newestRestorableDiscard([])).toBeNull();
  });

  it("reads the incoming versions once per pair of commits, and forgets them when none wait", async () => {
    const result = { totalCount: 1, versions: [], isTruncated: false };
    const readIncomingVersions = vi.fn(async () => result);
    const controller = createWorkDetailController({ readCommitFileChanges: vi.fn(), findRestorableDiscard: vi.fn(), readIncomingVersions });

    await controller.ensureIncoming(query, "a..b");
    await controller.ensureIncoming(query, "a..b");
    expect(readIncomingVersions).toHaveBeenCalledOnce();
    expect(controller.getSnapshot(query).incoming).toEqual({ key: "a..b", status: "ready", result });

    await controller.ensureIncoming(query, "a..c");
    expect(readIncomingVersions).toHaveBeenCalledTimes(2);
    controller.clearIncoming(query);
    expect(controller.getSnapshot(query).incoming).toBeNull();
  });
});
