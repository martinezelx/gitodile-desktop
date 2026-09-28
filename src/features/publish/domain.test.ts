import { describe, expect, it } from "vitest";
import { previewFromPendingVersions, type PendingVersionsResult, type SavedVersionSummary } from "./domain";

function version(commit: string): SavedVersionSummary {
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    title: `version ${commit}`,
    description: null,
    committedAt: "2026-09-01T10:00:00Z",
    author: "Luis Test",
  };
}

const pending: PendingVersionsResult = {
  totalCount: 3,
  versions: [version("ccc"), version("bbb"), version("aaa")],
  isTruncated: false,
};

describe("previewFromPendingVersions", () => {
  it("previews every pending version to the tracked remote branch", () => {
    expect(
      previewFromPendingVersions({ pending, pendingError: null, upstream: "origin/feature/x", hasUnsavedFiles: true }),
    ).toEqual({
      target: { remote: "origin", destinationBranch: "feature/x" },
      commitCount: 3,
      commitSummary: pending.versions,
      remainingAfterPublish: 0,
      hasUnsavedFiles: true,
    });
  });

  it("previews up to a checkpoint and counts the newer versions that stay behind", () => {
    const preview = previewFromPendingVersions({
      pending,
      pendingError: null,
      upstream: "origin/main",
      hasUnsavedFiles: false,
      upTo: "bbb",
    });
    expect(preview?.commitCount).toBe(2);
    expect(preview?.commitSummary.map((entry) => entry.commit)).toEqual(["bbb", "aaa"]);
    expect(preview?.remainingAfterPublish).toBe(1);
  });

  it("keeps the full count when the cached list is truncated", () => {
    const truncated = { ...pending, totalCount: 120, isTruncated: true };
    expect(
      previewFromPendingVersions({ pending: truncated, pendingError: null, upstream: "origin/main", hasUnsavedFiles: false })
        ?.commitCount,
    ).toBe(120);
  });

  it.each([
    ["there is no upstream", { upstream: null }],
    ["the upstream can't be split into remote and branch", { upstream: "origin" }],
    ["the pending list failed", { pendingError: "boom" }],
    ["nothing is pending", { pending: { totalCount: 0, versions: [], isTruncated: false } }],
    ["the checkpoint isn't in the list", { upTo: "zzz" }],
  ])("offers no preview when %s", (_case, overrides) => {
    expect(
      previewFromPendingVersions({
        pending,
        pendingError: null,
        upstream: "origin/main",
        hasUnsavedFiles: false,
        ...overrides,
      }),
    ).toBeNull();
  });
});
