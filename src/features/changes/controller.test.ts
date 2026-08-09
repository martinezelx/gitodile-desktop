import { describe, expect, it } from "vitest";

import { createChangesController, MAX_DIFF_CACHE_BYTES, MAX_DIFF_CACHE_ENTRIES } from "./controller";
import type { FileDiff } from "./domain";
import type { WorkingTreeStatus } from "../status";

const diff = (path: string): FileDiff => ({ kind: "unchanged", path, originalPath: null, change: "changed" });
const tree: WorkingTreeStatus = { isClean: false, counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 }, entries: [], truncated: false, hasPreparedChanges: false, hasUnpreparedChanges: true, upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 } };

describe("changes controller", () => {
  it("bounds project-epoch caches and releases an epoch completely", () => {
    const controller = createChangesController({
      readFileDiff: async ({ filePath }) => diff(filePath),
      readWorkingTreeDiffs: async () => [],
      readFileLines: async () => ({ startLine: 1, lines: [], truncated: false }),
    });
    for (let index = 0; index < 7; index += 1) controller.getStore(`/repo-${index}`, `epoch-${index}`, tree);
    expect(controller.size()).toBe(4);
    controller.close("/repo-6", "epoch-6");
    expect(controller.size()).toBe(3);
  });

  it("bounds the number of selected-file diffs retained per epoch", async () => {
    const controller = createChangesController({
      readFileDiff: async ({ filePath }) => diff(filePath),
      readWorkingTreeDiffs: async () => [],
      readFileLines: async () => ({ startLine: 1, lines: [], truncated: false }),
    });
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
    const controller = createChangesController({
      readFileDiff: async () => oversized,
      readWorkingTreeDiffs: async () => [],
      readFileLines: async () => ({ startLine: 1, lines: [], truncated: false }),
    });
    const store = controller.getStore("/repo", "epoch", tree);
    await controller.fetchDiff(store, "large.txt");
    expect(store.cache.size).toBe(0);
    expect(store.cachedBytes).toBe(0);
  });

  it("never serves a closed epoch's diff to a reopened project", async () => {
    let resolveOld!: (value: FileDiff) => void;
    const controller = createChangesController({
      readFileDiff: ({ sessionEpoch, filePath }) => sessionEpoch === "old"
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(diff(filePath)),
      readWorkingTreeDiffs: async () => [],
      readFileLines: async () => ({ startLine: 1, lines: [], truncated: false }),
    });
    const oldStore = controller.getStore("/repo", "old", tree);
    const oldRequest = controller.fetchDiff(oldStore, "old.txt");
    controller.close("/repo", "old");
    const newStore = controller.getStore("/repo", "new", tree);
    resolveOld(diff("old.txt"));
    await oldRequest;
    expect(newStore.cache.has("old.txt")).toBe(false);
  });
});
