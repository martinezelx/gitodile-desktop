import { describe, expect, it } from "vitest";

import { createChangesController, MAX_DIFF_CACHE_BYTES, MAX_DIFF_CACHE_ENTRIES } from "./controller";
import type { DiffWarmOutcome, FileDiff, WorkingTreeDiffBatch } from "./domain";
import type { WorkingTreeStatus } from "../status";
import type { ChangesPort } from "./port";

const diff = (path: string): FileDiff => ({ kind: "unchanged", path, originalPath: null, change: "changed" });
const tree: WorkingTreeStatus = { isClean: false, counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 }, entries: [], truncated: false, hasPreparedChanges: false, hasUnpreparedChanges: true, upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 } };
const batch = (diffs: FileDiff[], outcome: DiffWarmOutcome = "completed"): WorkingTreeDiffBatch => ({
  outcome,
  diffs,
  changedFiles: diffs.length,
  budgetBytes: 2 * 1024 * 1024,
});
const port = (overrides: Partial<ChangesPort> = {}): ChangesPort => ({
  readFileDiff: async ({ filePath }) => diff(filePath),
  readWorkingTreeDiffs: async () => batch([]),
  readFileLines: async () => ({ startLine: 1, lines: [], truncated: false }),
  planDiscard: async () => { throw new Error("unused"); },
  discard: async () => { throw new Error("unused"); },
  getDiscardRecovery: async () => { throw new Error("unused"); },
  restoreDiscard: async () => { throw new Error("unused"); },
  ...overrides,
});

describe("changes controller", () => {
  it("bounds project-epoch caches and releases an epoch completely", () => {
    const controller = createChangesController(port());
    for (let index = 0; index < 7; index += 1) controller.getStore(`/repo-${index}`, `epoch-${index}`, tree);
    expect(controller.size()).toBe(4);
    controller.close("/repo-6", "epoch-6");
    expect(controller.size()).toBe(3);
  });

  it("bounds the number of selected-file diffs retained per epoch", async () => {
    const controller = createChangesController(port());
    const store = controller.getStore("/repo", "epoch", tree);
    for (let index = 0; index < MAX_DIFF_CACHE_ENTRIES + 3; index += 1) {
      await controller.fetchDiff(store, `${index}.txt`);
    }
    expect(store.cache.size).toBe(MAX_DIFF_CACHE_ENTRIES);
    expect(store.cache.has("0.txt")).toBe(false);
  });

  it("does not retain a diff that exceeds the per-epoch byte budget", async () => {
    const oversized: FileDiff = {
      kind: "text",
      path: "large.txt",
      originalPath: null,
      change: "changed",
      hunks: [{
        header: "@@ -1 +1 @@",
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: "addition", content: "x".repeat(MAX_DIFF_CACHE_BYTES / 2), oldLineNumber: null, newLineNumber: 1 }],
      }],
      truncated: false,
    };
    const controller = createChangesController(port({ readFileDiff: async () => oversized }));
    const store = controller.getStore("/repo", "epoch", tree);
    await controller.fetchDiff(store, "large.txt");
    expect(store.cache.size).toBe(0);
    expect(store.cachedBytes).toBe(0);
  });

  it("never serves a closed epoch's diff to a reopened project", async () => {
    let resolveOld!: (value: FileDiff) => void;
    const controller = createChangesController(port({
      readFileDiff: ({ sessionEpoch, filePath }) => sessionEpoch === "old"
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(diff(filePath)),
    }));
    const oldStore = controller.getStore("/repo", "old", tree);
    const oldRequest = controller.fetchDiff(oldStore, "old.txt");
    controller.close("/repo", "old");
    const newStore = controller.getStore("/repo", "new", tree);
    resolveOld(diff("old.txt"));
    await oldRequest;
    expect(newStore.cache.has("old.txt")).toBe(false);
  });

  it("caches a completed warm and leaves a deferred one to the on-demand path", async () => {
    const requested: string[] = [];
    const completed = createChangesController(port({
      readWorkingTreeDiffs: async () => batch([diff("warmed.txt")]),
      readFileDiff: async ({ filePath }) => {
        requested.push(filePath);
        return diff(filePath);
      },
    }));
    const warmedStore = completed.getStore("/repo", "epoch", tree);
    await completed.warmStore(warmedStore);
    expect(warmedStore.warmOutcome).toBe("completed");
    expect(warmedStore.cache.has("warmed.txt")).toBe(true);
    // A warmed file is a cache hit, so opening it costs no request at all.
    await completed.fetchDiff(warmedStore, "warmed.txt");
    expect(requested).toEqual([]);

    const deferredRequests: string[] = [];
    const deferred = createChangesController(port({
      readWorkingTreeDiffs: async () => batch([], "deferred"),
      readFileDiff: async ({ filePath }) => {
        deferredRequests.push(filePath);
        return diff(filePath);
      },
    }));
    const deferredStore = deferred.getStore("/repo", "epoch", tree);
    await deferred.warmStore(deferredStore);
    expect(deferredStore.warmOutcome).toBe("deferred");
    expect(deferredStore.cache.size).toBe(0);
    // Deferring must never fan out into one request per changed file: only the
    // file the user actually opens is fetched.
    expect(deferredRequests).toEqual([]);
    await deferred.fetchDiff(deferredStore, "opened.txt");
    expect(deferredRequests).toEqual(["opened.txt"]);
  });

  it("never lets a stale warm response populate a newer store generation", async () => {
    let resolveWarm!: (value: WorkingTreeDiffBatch) => void;
    const controller = createChangesController(port({
      readWorkingTreeDiffs: () => new Promise((resolve) => { resolveWarm = resolve; }),
    }));
    const store = controller.getStore("/repo", "epoch", tree);
    const warming = controller.warmStore(store);
    controller.close("/repo", "epoch");
    resolveWarm(batch([diff("stale.txt")]));
    await warming;
    expect(store.cache.has("stale.txt")).toBe(false);
    expect(store.warmOutcome).toBeNull();
  });
});
