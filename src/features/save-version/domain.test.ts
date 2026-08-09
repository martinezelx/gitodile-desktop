import { describe, expect, it } from "vitest";
import { getSaveVersionBreakdown } from "./domain";
import type { WorkingTreeCounts } from "../status";

function counts(overrides: Partial<WorkingTreeCounts>): WorkingTreeCounts {
  return { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0, ...overrides };
}

describe("getSaveVersionBreakdown", () => {
  it("omits zero counts", () => {
    expect(getSaveVersionBreakdown(counts({ changed: 2, total: 2 }))).toEqual([{ category: "changed", count: 2 }]);
  });

  it("orders conflicted first, then changed/new/deleted/renamed", () => {
    const breakdown = getSaveVersionBreakdown(
      counts({ renamed: 1, deleted: 1, new: 1, changed: 1, conflicted: 1, total: 5 }),
    );
    expect(breakdown.map((item) => item.category)).toEqual(["conflicted", "changed", "new", "deleted", "renamed"]);
  });

  it("returns an empty list for a clean plan", () => {
    expect(getSaveVersionBreakdown(counts({}))).toEqual([]);
  });
});
