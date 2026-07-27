import { describe, expect, it } from "vitest";
import { getOrderedChangeEntries, resolveSelectedPath } from "./changes";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "./repositoryOverview";

function entry(path: string, category: ChangeCategory, originalPath: string | null = null): WorkingTreeEntry {
  return { path, originalPath, category };
}

function status(entries: WorkingTreeEntry[], truncated = false): WorkingTreeStatus {
  return {
    isClean: entries.length === 0,
    counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: entries.length },
    entries,
    truncated,
    upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
  };
}

describe("getOrderedChangeEntries", () => {
  it("puts conflicted files first regardless of their original position", () => {
    const entries = [entry("a.txt", "changed"), entry("b.txt", "conflicted"), entry("c.txt", "new")];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual(["b.txt", "a.txt", "c.txt"]);
  });

  it("keeps a stable, documented order across every category", () => {
    const entries = [
      entry("renamed.txt", "renamed", "old.txt"),
      entry("deleted.txt", "deleted"),
      entry("new.txt", "new"),
      entry("conflicted.txt", "conflicted"),
      entry("changed.txt", "changed"),
    ];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual([
      "conflicted.txt",
      "changed.txt",
      "new.txt",
      "deleted.txt",
      "renamed.txt",
    ]);
  });

  it("preserves the original relative order of entries within the same category", () => {
    const entries = [entry("b.txt", "changed"), entry("a.txt", "changed")];

    expect(getOrderedChangeEntries(status(entries)).map((e) => e.path)).toEqual(["b.txt", "a.txt"]);
  });

  it("does not mutate the status entries array", () => {
    const entries = [entry("b.txt", "new"), entry("a.txt", "conflicted")];
    const original = status(entries);

    getOrderedChangeEntries(original);

    expect(original.entries).toEqual(entries);
  });
});

describe("resolveSelectedPath", () => {
  const entries = [entry("a.txt", "changed"), entry("b.txt", "new")];

  it("selects the first entry when there is no previous selection", () => {
    expect(resolveSelectedPath(entries, null)).toBe("a.txt");
  });

  it("preserves the previous selection when it is still present", () => {
    expect(resolveSelectedPath(entries, "b.txt")).toBe("b.txt");
  });

  it("falls back to the first entry when the previous selection has disappeared", () => {
    expect(resolveSelectedPath(entries, "gone.txt")).toBe("a.txt");
  });

  it("returns null when the list is empty", () => {
    expect(resolveSelectedPath([], "a.txt")).toBeNull();
  });
});
