import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAVOURITE_BRANCHES_STORAGE_KEY, useStoredFavouriteBranches } from "./favourites";
import { BRANCH_FOLDS_STORAGE_KEY, useStoredBranchFolds } from "./branchFolds";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("branch preferences", () => {
  it("reads and validates current favourites and folds across launches", () => {
    const favourites = { "/repo/.git": ["main", "feature/a", "main", 3], "/other/.git": ["other"] };
    const folds = { "/repo/.git": { "bucket:clean-up": false, "cluster:in-progress:feature": true, invalid: 7 } };
    localStorage.setItem(FAVOURITE_BRANCHES_STORAGE_KEY, JSON.stringify(favourites));
    localStorage.setItem(BRANCH_FOLDS_STORAGE_KEY, JSON.stringify(folds));
    const read = () => ({ favourites: useStoredFavouriteBranches("/repo/.git"), folds: useStoredBranchFolds("/repo/.git") });
    const first = renderHook(read);
    expect(first.result.current.favourites[0]).toEqual(new Set(["main", "feature/a"]));
    expect(first.result.current.folds[0]).toEqual({ "bucket:clean-up": false, "cluster:in-progress:feature": true });
    expect(JSON.parse(localStorage.getItem(FAVOURITE_BRANCHES_STORAGE_KEY)!)["/other/.git"]).toEqual(["other"]);
    first.unmount();
    const second = renderHook(read);
    expect(second.result.current.favourites[0]).toEqual(new Set(["main", "feature/a"]));
    expect(second.result.current.folds[0]["bucket:clean-up"]).toBe(false);
  });

  it("accepts empty choices", () => {
    localStorage.setItem(FAVOURITE_BRANCHES_STORAGE_KEY, "{}");
    localStorage.setItem(BRANCH_FOLDS_STORAGE_KEY, "{}");
    expect(renderHook(() => useStoredFavouriteBranches("/repo")).result.current[0]).toEqual(new Set());
    expect(renderHook(() => useStoredBranchFolds("/repo")).result.current[0]).toEqual({});
  });

  it.each(["broken json", "[]", "null", "7"])("ignores malformed storage (%s)", (value) => {
    localStorage.setItem(FAVOURITE_BRANCHES_STORAGE_KEY, value);
    expect(renderHook(() => useStoredFavouriteBranches("/repo")).result.current[0]).toEqual(new Set());
  });

  it("retains saved data and supports in-memory choices when writes fail", () => {
    const saved = JSON.stringify({ "/repo": ["main"] });
    localStorage.setItem(FAVOURITE_BRANCHES_STORAGE_KEY, saved);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    const { result } = renderHook(() => useStoredFavouriteBranches("/repo"));
    act(() => result.current[1]("feature/new"));
    expect(result.current[0]).toEqual(new Set(["main", "feature/new"]));
    expect(localStorage.getItem(FAVOURITE_BRANCHES_STORAGE_KEY)).toBe(saved);
  });

  it("remains usable when reads are unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("private"); });
    expect(renderHook(() => useStoredBranchFolds("/repo")).result.current[0]).toEqual({});
  });
});
