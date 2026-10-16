import { describe, expect, it } from "vitest";

import type { SavedVersionSummary } from "./domain";
import {
  MAX_LANES,
  detourHolding,
  firstParentChain,
  layoutLanes,
  versionsWithDetours,
} from "./timelineLanes";

/** A version named by its id, with its parents and an hour on 15 Oct 2026. */
function v(commit: string, parents: string[] = [], hour = 12, day = 15): SavedVersionSummary {
  const at = { unixSeconds: Math.floor(new Date(2026, 9, day, hour).getTime() / 1_000), offsetMinutes: 120 };
  return {
    commit,
    shortCommit: commit,
    parents,
    subject: commit,
    description: "",
    author: null,
    authoredAt: at,
    committedAt: at,
    decorations: [],
    isRoot: parents.length === 0,
    isMerge: parents.length > 1,
    publication: "published",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

/* r1 ← r2 (merge of q1 ← q2) ← r3 ← root, in topological order. */
const merged = [v("r1", ["r2"]), v("r2", ["r3", "q1"]), v("q1", ["q2"]), v("q2", ["r3"]), v("r3", ["root"]), v("root")];
const ids = (versions: readonly SavedVersionSummary[]): string[] => versions.map((version) => version.commit);

describe("firstParentChain", () => {
  it("walks the tip's first parents only", () => {
    expect([...firstParentChain(merged)]).toEqual(["r1", "r2", "r3", "root"]);
  });
});

describe("versionsWithDetours", () => {
  it("folds what a merge brought in, and shows it once opened", () => {
    const folded = versionsWithDetours(merged, new Set());
    expect(ids(folded.visible)).toEqual(["r1", "r2", "r3", "root"]);
    expect(folded.detours.get("r2")).toEqual({ merge: "r2", versions: ["q1", "q2"], open: false });

    const opened = versionsWithDetours(merged, new Set(["r2"]));
    expect(ids(opened.visible)).toEqual(ids(merged));
    expect(detourHolding(folded.detours, "q2")).toBe("r2");
    expect(detourHolding(folded.detours, "r3")).toBeNull();
  });

  it("folds merges inside a merged line with it, and keeps what no merge accounts for", () => {
    const nested = [v("r1", ["r2", "q1"]), v("q1", ["q2", "z1"]), v("z1", ["q2"]), v("q2", ["r2"]), v("r2"), v("stray")];
    const folded = versionsWithDetours(nested, new Set());
    expect(folded.detours.get("r1")!.versions.sort()).toEqual(["q1", "q2", "z1"]);
    expect(ids(folded.visible)).toEqual(["r1", "r2", "stray"]);
  });

  it("keeps no detour for a merge whose other side is not loaded", () => {
    const partial = [v("r1", ["r2", "elsewhere"]), v("r2")];
    expect(versionsWithDetours(partial, new Set()).detours.size).toBe(0);
  });
});

describe("layoutLanes", () => {
  it("keeps a straight history on one lane", () => {
    const layout = layoutLanes([v("a", ["b"]), v("b", ["c"]), v("c")]);
    expect(layout.width).toBe(1);
    expect([...layout.rows.values()].every((row) => row.lane === 0 && row.tint === 0)).toBe(true);
  });

  it("opens a second lane at a merge and joins it back at the shared parent", () => {
    const layout = layoutLanes(merged);
    expect(layout.width).toBe(2);
    const merge = layout.rows.get("r2")!;
    expect(merge.edges).toEqual([{ lane: 0, tint: 0 }, { lane: 1, tint: 1 }]);
    expect(layout.rows.get("q1")!.lane).toBe(1);
    expect(layout.rows.get("q2")!.lanesOut).toEqual([{ commit: "r3", tint: 0 }, { commit: "r3", tint: 1 }]);
    const join = layout.rows.get("r3")!;
    expect(join.lane).toBe(0);
    expect(join.lanesIn.map((slot) => slot?.commit)).toEqual(["r3", "r3"]);
    expect(layout.rows.get("r1")!.lanesIn).toEqual([null]);
    expect(join.lanesOut).toEqual([{ commit: "root", tint: 0 }]);
  });

  it("gives a new tip its own lane and tint", () => {
    const layout = layoutLanes([v("main", ["base"]), v("feature", ["base"]), v("base")]);
    expect(layout.rows.get("feature")).toMatchObject({ lane: 1, tint: 1 });
    expect(layout.rows.get("base")!.lanesIn.map((slot) => slot?.commit)).toEqual(["base", "base"]);
  });

  it("draws no line to a parent outside the versions", () => {
    const row = layoutLanes([v("a", ["missing"])]).rows.get("a")!;
    expect(row.edges).toEqual([]);
    expect(row.lanesOut).toEqual([]);
  });

  it("caps the width it asks for", () => {
    const tips = Array.from({ length: MAX_LANES + 3 }, (_, n) => v(`tip${n}`, ["base"]));
    expect(layoutLanes([...tips, v("base")]).width).toBe(MAX_LANES);
  });
});

describe("layoutLanes lines", () => {
  const named = (commit: string, parents: string[], subject: string, branch?: string): SavedVersionSummary => ({
    ...v(commit, parents),
    subject,
    decorations: branch ? [{ kind: "localBranch", name: branch, fullRef: `refs/heads/${branch}` }] : [],
  });

  it("names a lane from its references or from the merge that brought it in", () => {
    const layout = layoutLanes([
      named("r1", ["r2", "q1"], "Merge branch 'feature/quick' into release", "release"),
      named("q1", ["r2"], "work"),
      named("r2", [], "base"),
    ]);
    expect(layout.lines.get(0)?.name).toBe("release");
    expect(layout.lines.get(1)?.name).toBe("feature/quick");
  });

  it("says whether all of a line went into another, or how many versions came after", () => {
    /* main saves m1 after release merged m2 into itself. */
    const layout = layoutLanes([
      named("m1", ["m2"], "after", "main"),
      named("r1", ["r2", "m2"], "Merge branch 'main' into release", "release"),
      named("m2", ["base"], "merged"),
      named("r2", ["base"], "release work"),
      named("base", [], "base"),
    ]);
    const main = [...layout.lines.values()].find((line) => line.name === "main")!;
    const release = [...layout.lines.entries()].find(([, line]) => line.name === "release")!;
    expect(main.lastMerge).toEqual({ into: release[0], after: 1 });
    expect(release[1].lastMerge).toBeNull();
  });
});

