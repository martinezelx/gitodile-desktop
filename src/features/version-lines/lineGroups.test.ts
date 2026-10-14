import { describe, expect, it } from "vitest";

import type { VersionLine } from "./domain";
import {
  bucketItemId,
  clusterItemId,
  LARGE_CLUSTER_SIZE,
  groupVersionLines,
  headingsAbove,
  lineNameParts,
  visibleLineTree,
} from "./lineGroups";

function line(name: string, overrides: Partial<VersionLine> = {}): VersionLine {
  return {
    name,
    tip: { commit: "a".repeat(40), shortCommit: "aaaaaaa", subject: "work", committedAt: "2026-10-13T10:00:00Z" },
    isActive: false,
    upstream: `origin/${name}`,
    isRetainedElsewhere: false,
    uniqueCommitCount: null,
    worktreePath: null,
    upstreamAhead: 0,
    upstreamBehind: 0,
    upstreamGone: false,
    isDefault: false,
    ...overrides,
  };
}

const names = (lines: readonly VersionLine[]): string[] => lines.map((entry) => entry.name);

describe("groupVersionLines", () => {
  const active = line("release/0.3.1", { isActive: true });
  const others = [
    line("feature/history-boundary"),
    line("main", { isDefault: true, isRetainedElsewhere: true }),
    line("fix/crlf"),
    line("feature/quick-switch"),
    line("codex/feature/about-polish", { isRetainedElsewhere: true }),
    line("fix/draft-lookup", { isRetainedElsewhere: true, upstreamGone: true }),
    line("fix/draft-asset", { isRetainedElsewhere: true, upstreamGone: true }),
    line("codex/dependabot", { isRetainedElsewhere: true }),
    line("spike", { isRetainedElsewhere: true }),
    line("feature/in-other-worktree", { isRetainedElsewhere: true, worktreePath: "/elsewhere" }),
  ];

  it("pins where the project is and the main line, in that order", () => {
    expect(names(groupVersionLines(active, others).pinned)).toEqual(["release/0.3.1", "main"]);
  });

  it("splits the rest by what can be done with them", () => {
    const { buckets } = groupVersionLines(active, others);
    expect(buckets.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["in-progress", 4],
      ["clean-up", 5],
    ]);
  });

  it("keeps a line open in another worktree with the work in progress", () => {
    const [inProgress] = groupVersionLines(active, others).buckets;
    expect(names(inProgress!.clusters[0]!.lines)).toContain("feature/in-other-worktree");
  });

  it("clusters a prefix shared by two or more lines and leaves the rest loose, in the given order", () => {
    const [inProgress, cleanUp] = groupVersionLines(active, others).buckets;
    expect(names(inProgress!.loose)).toEqual(["fix/crlf"]);
    expect(inProgress!.clusters.map((cluster) => [cluster.prefix, names(cluster.lines)])).toEqual([
      ["feature", ["feature/history-boundary", "feature/quick-switch", "feature/in-other-worktree"]],
    ]);
    expect(names(cleanUp!.loose)).toEqual(["spike"]);
    expect(cleanUp!.clusters.map((cluster) => cluster.prefix)).toEqual(["codex", "fix"]);
  });

  it("drops an empty bucket and works without an active or main line", () => {
    const grouped = groupVersionLines(null, [line("feature/a"), line("feature/b")]);
    expect(grouped.pinned).toEqual([]);
    expect(grouped.buckets.map((bucket) => bucket.key)).toEqual(["in-progress"]);
  });
});

describe("lineNameParts", () => {
  it("quiets the prefix of a loose line", () => {
    expect(lineNameParts("codex/feature/about-polish", null)).toEqual({ quiet: "codex/feature/", own: "about-polish" });
    expect(lineNameParts("main", null)).toEqual({ quiet: "", own: "main" });
  });

  it("drops the cluster's prefix and keeps only the middle part quiet", () => {
    expect(lineNameParts("codex/feature/about-polish", "codex")).toEqual({ quiet: "feature/", own: "about-polish" });
    expect(lineNameParts("fix/crlf", "fix")).toEqual({ quiet: "", own: "crlf" });
  });
});

describe("visibleLineTree", () => {
  const grouped = groupVersionLines(line("main", { isActive: true, isDefault: true }), [
    line("feature/a"),
    line("feature/b"),
    line("fix/old", { isRetainedElsewhere: true }),
  ]);
  const id = (name: string): string => `row-${name}`;

  it("draws headings and rows at their levels, the clean-up block closed by default", () => {
    const items = visibleLineTree(grouped, (_, byDefault) => byDefault, id);
    expect(items.map((item) => [item.kind, item.id, item.level])).toEqual([
      ["line", "row-main", 1],
      ["bucket", bucketItemId("in-progress"), 1],
      ["cluster", clusterItemId("in-progress", "feature"), 2],
      ["line", "row-feature/a", 3],
      ["line", "row-feature/b", 3],
      ["bucket", bucketItemId("clean-up"), 1],
    ]);
  });

  it("leaves out everything under a closed heading", () => {
    const items = visibleLineTree(grouped, (itemId) => itemId !== clusterItemId("in-progress", "feature"), id);
    expect(items.map((item) => item.id)).toEqual([
      "row-main",
      bucketItemId("in-progress"),
      clusterItemId("in-progress", "feature"),
      bucketItemId("clean-up"),
      "row-fix/old",
    ]);
  });

  it("starts a crowded cluster folded", () => {
    const crowd = Array.from({ length: LARGE_CLUSTER_SIZE + 1 }, (_, n) => line(`dependabot/bump-${n}`));
    const items = visibleLineTree(groupVersionLines(null, [...crowd, line("feature/a"), line("feature/b")]), (_, d) => d, id);
    expect(items.map((item) => [item.id, item.kind === "line" ? null : item.expanded])).toEqual([
      [bucketItemId("in-progress"), true],
      [clusterItemId("in-progress", "dependabot"), false],
      [clusterItemId("in-progress", "feature"), true],
      ["row-feature/a", null],
      ["row-feature/b", null],
    ]);
  });

  it("names the headings a line sits under", () => {
    expect(headingsAbove(grouped, "feature/b")).toEqual([
      bucketItemId("in-progress"),
      clusterItemId("in-progress", "feature"),
    ]);
    expect(headingsAbove(grouped, "fix/old")).toEqual([bucketItemId("clean-up")]);
    expect(headingsAbove(grouped, "main")).toEqual([]);
  });
});
