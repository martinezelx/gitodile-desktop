import { describe, expect, it } from "vitest";

import type { ChangeCategory, WorkingTreeEntry } from "../status";
import { CHANGES_PREVIEW_LIMIT, sampleChangesPreview } from "./changesPreview";

function entry(path: string, category: ChangeCategory): WorkingTreeEntry {
  return { path, originalPath: null, category, isPrepared: false, hasUnpreparedChanges: true };
}

describe("sampleChangesPreview", () => {
  it("names every category before spending the budget on the biggest one", () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, index) => entry(`edited-${index}.ts`, "changed")),
      entry("added.ts", "new"),
      entry("removed.ts", "deleted"),
      entry("moved.ts", "renamed"),
    ];

    const sample = sampleChangesPreview(entries, CHANGES_PREVIEW_LIMIT);

    expect(sample).toHaveLength(CHANGES_PREVIEW_LIMIT);
    expect(sample.map((item) => item.category)).toEqual([
      "changed", "changed", "changed", "new", "deleted", "renamed",
    ]);
    // Within a category the original order is kept, so the rows are stable
    // between refreshes that do not change the working tree.
    expect(sample.slice(0, 3).map((item) => item.path)).toEqual(["edited-0.ts", "edited-1.ts", "edited-2.ts"]);
  });

  it("lists conflicts first, in the chips' own order", () => {
    const entries = [entry("a.ts", "new"), entry("b.ts", "conflicted"), entry("c.ts", "changed")];

    expect(sampleChangesPreview(entries, CHANGES_PREVIEW_LIMIT).map((item) => item.path)).toEqual(
      ["b.ts", "c.ts", "a.ts"],
    );
  });

  it("returns everything when there is less than the budget", () => {
    const entries = [entry("a.ts", "changed"), entry("b.ts", "changed")];

    expect(sampleChangesPreview(entries, CHANGES_PREVIEW_LIMIT)).toEqual(entries);
    expect(sampleChangesPreview([], CHANGES_PREVIEW_LIMIT)).toEqual([]);
  });
});
