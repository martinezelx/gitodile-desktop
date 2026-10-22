import { describe, expect, it } from "vitest";

import type { Branch } from "./domain";
import {
  bucketItemId,
  clusterItemId,
  LARGE_CLUSTER_SIZE,
  groupBranches,
  headingsAbove,
  branchNameParts,
  visibleBranchTree,
} from "./branchGroups";

function branch(name: string, overrides: Partial<Branch> = {}): Branch {
  return {
    name,
    tip: { commit: "a".repeat(40), shortCommit: "aaaaaaa", subject: "work", committedAt: "2026-10-13T10:00:00Z" },
    isActive: false,
    upstream: `origin/${name}`,
    isRetainedElsewhere: false,
    isFinished: false,
    uniqueCommitCount: null,
    worktreePath: null,
    upstreamAhead: 0,
    upstreamBehind: 0,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

const names = (branches: readonly Branch[]): string[] => branches.map((entry) => entry.name);

describe("groupBranches", () => {
  const active = branch("release/0.3.1", { isActive: true });
  const others = [
    branch("feature/history-boundary"),
    branch("main", { isDefault: true, isRetainedElsewhere: true, isFinished: true }),
    branch("fix/crlf"),
    branch("feature/quick-switch"),
    branch("codex/feature/about-polish", { isRetainedElsewhere: true, isFinished: true }),
    branch("fix/draft-lookup", { isRetainedElsewhere: true, isFinished: true, upstreamGone: true }),
    branch("fix/draft-asset", { isRetainedElsewhere: true, isFinished: true, upstreamGone: true }),
    branch("codex/dependabot", { isRetainedElsewhere: true, isFinished: true }),
    branch("spike", { isRetainedElsewhere: true, isFinished: true }),
    branch("feature/in-other-worktree", { isRetainedElsewhere: true, isFinished: true, worktreePath: "/elsewhere" }),
  ];

  it("pins where the project is and the main branch, in that order", () => {
    expect(names(groupBranches(active, others).pinned)).toEqual(["release/0.3.1", "main"]);
  });

  it("keeps a branch in progress when deleting it would lose nothing but it isn't finished", () => {
    // Published and in sync: its own remote copy keeps it, and it is still work.
    const published = branch("feature/in-review", { isRetainedElsewhere: true, isFinished: false, upstream: "origin/feature/in-review" });
    const { buckets } = groupBranches(active, [published]);
    expect(buckets.map((bucket) => bucket.key)).toEqual(["in-progress"]);
  });

  it("splits the rest by what can be done with them", () => {
    const { buckets } = groupBranches(active, others);
    expect(buckets.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["in-progress", 4],
      ["clean-up", 5],
    ]);
  });

  it("keeps a branch open in another worktree with the work in progress", () => {
    const [inProgress] = groupBranches(active, others).buckets;
    expect(names(inProgress!.clusters[0]!.branches)).toContain("feature/in-other-worktree");
  });

  it("clusters a prefix shared by two or more branches and leaves the rest loose, in the given order", () => {
    const [inProgress, cleanUp] = groupBranches(active, others).buckets;
    expect(names(inProgress!.loose)).toEqual(["fix/crlf"]);
    expect(inProgress!.clusters.map((cluster) => [cluster.prefix, names(cluster.branches)])).toEqual([
      ["feature", ["feature/history-boundary", "feature/quick-switch", "feature/in-other-worktree"]],
    ]);
    expect(names(cleanUp!.loose)).toEqual(["spike"]);
    expect(cleanUp!.clusters.map((cluster) => cluster.prefix)).toEqual(["codex", "fix"]);
  });

  it("drops an empty bucket and works without an active or main branch", () => {
    const grouped = groupBranches(null, [branch("feature/a"), branch("feature/b")]);
    expect(grouped.pinned).toEqual([]);
    expect(grouped.buckets.map((bucket) => bucket.key)).toEqual(["in-progress"]);
  });
});

describe("branchNameParts", () => {
  it("quiets the prefix of a loose branch", () => {
    expect(branchNameParts("codex/feature/about-polish", null)).toEqual({ quiet: "codex/feature/", own: "about-polish" });
    expect(branchNameParts("main", null)).toEqual({ quiet: "", own: "main" });
  });

  it("drops the cluster's prefix and keeps only the middle part quiet", () => {
    expect(branchNameParts("codex/feature/about-polish", "codex")).toEqual({ quiet: "feature/", own: "about-polish" });
    expect(branchNameParts("fix/crlf", "fix")).toEqual({ quiet: "", own: "crlf" });
  });
});

describe("visibleBranchTree", () => {
  const grouped = groupBranches(branch("main", { isActive: true, isDefault: true }), [
    branch("feature/a"),
    branch("feature/b"),
    branch("fix/old", { isRetainedElsewhere: true, isFinished: true }),
  ]);
  const id = (name: string): string => `row-${name}`;

  it("draws headings and rows at their levels, the clean-up block closed by default", () => {
    const items = visibleBranchTree(grouped, (_, byDefault) => byDefault, id);
    expect(items.map((item) => [item.kind, item.id, item.level])).toEqual([
      ["branch", "row-main", 1],
      ["bucket", bucketItemId("in-progress"), 1],
      ["cluster", clusterItemId("in-progress", "feature"), 2],
      ["branch", "row-feature/a", 3],
      ["branch", "row-feature/b", 3],
      ["bucket", bucketItemId("clean-up"), 1],
    ]);
  });

  it("leaves out everything under a closed heading", () => {
    const items = visibleBranchTree(grouped, (itemId) => itemId !== clusterItemId("in-progress", "feature"), id);
    expect(items.map((item) => item.id)).toEqual([
      "row-main",
      bucketItemId("in-progress"),
      clusterItemId("in-progress", "feature"),
      bucketItemId("clean-up"),
      "row-fix/old",
    ]);
  });

  it("starts a crowded cluster folded", () => {
    const crowd = Array.from({ length: LARGE_CLUSTER_SIZE + 1 }, (_, n) => branch(`dependabot/bump-${n}`));
    const items = visibleBranchTree(groupBranches(null, [...crowd, branch("feature/a"), branch("feature/b")]), (_, d) => d, id);
    expect(items.map((item) => [item.id, item.kind === "branch" ? null : item.expanded])).toEqual([
      [bucketItemId("in-progress"), true],
      [clusterItemId("in-progress", "dependabot"), false],
      [clusterItemId("in-progress", "feature"), true],
      ["row-feature/a", null],
      ["row-feature/b", null],
    ]);
  });

  it("names the headings a branch sits under", () => {
    expect(headingsAbove(grouped, "feature/b")).toEqual([
      bucketItemId("in-progress"),
      clusterItemId("in-progress", "feature"),
    ]);
    expect(headingsAbove(grouped, "fix/old")).toEqual([bucketItemId("clean-up")]);
    expect(headingsAbove(grouped, "main")).toEqual([]);
  });
});
