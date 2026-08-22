import { describe, expect, it, vi } from "vitest";

import type { FileDiff } from "../changes";
import { createHistoryController, HISTORY_PAGE_SIZE, MAX_HISTORY_SESSION_CACHES } from "./controller";
import type { HistoryPage, SavedVersionDetail, SavedVersionSummary } from "./domain";
import type { HistoryPort, HistoryQuery } from "./port";

const query: HistoryQuery = { projectId: "/repo", sessionEpoch: "epoch-1" };

function version(index: number): SavedVersionSummary {
  const commit = index.toString(16).padStart(40, "0");
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    parents: index === 0 ? [] : [(index - 1).toString(16).padStart(40, "0")],
    subject: `Version ${index}`,
    description: index % 2 ? "A multiline\ndescription ✓" : "",
    author: { name: "Ada", email: "ada@example.test" },
    authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    decorations: [],
    isRoot: index === 0,
    isMerge: false,
    publication: "local-only",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

function page(items: SavedVersionSummary[], overrides: Partial<HistoryPage> = {}): HistoryPage {
  return {
    repositoryId: "/repo",
    snapshotToken: "snapshot-1",
    branch: "main",
    headState: "branch",
    headCommit: items[0]?.commit ?? null,
    upstream: null,
    versions: items,
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
    ...overrides,
  };
}

function detail(item: SavedVersionSummary): SavedVersionDetail {
  return {
    version: item,
    comparisonBase: item.parents[0] ?? "empty-tree",
    comparisonIsEmptyTree: item.isRoot,
    comparisonIsFirstParent: false,
    files: [{ path: "src/app.ts", originalPath: null, category: "changed" }],
    fileCounts: { changed: 1, new: 0, deleted: 0, renamed: 0, total: 1 },
    filesTruncated: false,
    countsAreMinimum: false,
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

function port(overrides: Partial<HistoryPort> = {}): HistoryPort {
  return {
    readPage: vi.fn(async () => page([version(1), version(0)])),
    readDetail: vi.fn(async ({ commit }) => detail(commit === version(0).commit ? version(0) : version(1))),
    readFileDiff: vi.fn(async ({ filePath }) => ({
      kind: "text", path: filePath, originalPath: null, change: "changed", hunks: [], truncated: false,
    } satisfies FileDiff)),
    ...overrides,
  };
}

describe("HistoryController", () => {
  it("coalesces the first page and asks Rust for the bounded page size", async () => {
    const pending = deferred<HistoryPage>();
    const readPage = vi.fn(() => pending.promise);
    const controller = createHistoryController(port({ readPage }));
    const first = controller.refresh(query);
    expect(controller.refresh(query)).toBe(first);
    expect(readPage).toHaveBeenCalledWith({ ...query, pageSize: HISTORY_PAGE_SIZE });
    pending.resolve(page([version(1), version(0)]));
    await first;
    expect(controller.getSnapshot(query).versions).toHaveLength(2);
    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
  });

  it("appends unique versions and keeps pagination metadata snapshot-consistent", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)], { hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(page([version(2), version(1), version(0)], { hasMore: false }));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    await controller.loadMore(query);
    expect(controller.getSnapshot(query).versions.map(({ subject }) => subject)).toEqual([
      "Version 3", "Version 2", "Version 1", "Version 0",
    ]);
    expect(controller.getSnapshot(query).snapshot?.hasMore).toBe(false);
    expect(readPage).toHaveBeenLastCalledWith({ ...query, cursor: "cursor-2", pageSize: HISTORY_PAGE_SIZE });
  });

  it("automatically restarts from the newest page after a stale cursor", async () => {
    const refreshed = page([version(4), version(3)], { snapshotToken: "snapshot-2" });
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)], { hasMore: true, nextCursor: "stale" }))
      .mockRejectedValueOnce({ code: "stale_history_cursor", message: "stale", remediation: null })
      .mockResolvedValueOnce(refreshed);
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    await controller.loadMore(query);
    await vi.waitFor(() => expect(controller.getSnapshot(query).snapshot?.snapshotToken).toBe("snapshot-2"));
    expect(controller.getSnapshot(query).staleNotice).toBe(true);
    expect(controller.getSnapshot(query).versions[0]?.subject).toBe("Version 4");
  });

  it("loads detail and a typed diff once, then serves both from bounded caches", async () => {
    const readDetail = vi.fn(async () => detail(version(1)));
    const readFileDiff = vi.fn(async () => ({
      kind: "binary", path: "src/app.ts", originalPath: null, change: "changed",
    } satisfies FileDiff));
    const controller = createHistoryController(port({ readDetail, readFileDiff }));
    await controller.refresh(query);
    await vi.waitFor(() => expect(controller.getSnapshot(query).detail.detail).not.toBeNull());
    controller.selectFile(query, "src/app.ts");
    await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff).not.toBeNull());
    controller.selectVersion(query, version(0).commit);
    controller.selectVersion(query, version(1).commit);
    controller.selectFile(query, "src/app.ts");
    expect(readDetail).toHaveBeenCalledTimes(2);
    expect(readFileDiff).toHaveBeenCalledTimes(1);
  });

  it("rejects late responses from closed epochs and bounds inactive sessions", async () => {
    const oldPage = deferred<HistoryPage>();
    const controller = createHistoryController(port({ readPage: vi.fn((request) =>
      request.sessionEpoch === "old" ? oldPage.promise : Promise.resolve(page([version(9)])),
    ) }));
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const pending = controller.refresh(oldQuery);
    controller.close(oldQuery);
    await controller.refresh({ projectId: "/repo", sessionEpoch: "new" });
    oldPage.resolve(page([version(1)]));
    await pending;
    expect(controller.getSnapshot({ projectId: "/repo", sessionEpoch: "new" }).versions[0]?.subject).toBe("Version 9");
    for (let index = 0; index < 12; index += 1) {
      controller.getSnapshot({ projectId: `/repo-${index}`, sessionEpoch: `epoch-${index}` });
    }
    expect(controller.size()).toBeLessThanOrEqual(MAX_HISTORY_SESSION_CACHES);
  });
});
