import { describe, expect, it } from "vitest";

import { getChangesEmptyState } from "./emptyState";

function tree(upstream: { upstream: string | null; ahead: number; behind: number }) {
  return { upstream: { branch: "main", ...upstream } };
}

describe("getChangesEmptyState", () => {
  it("reports a line that has no saved versions yet", () => {
    expect(getChangesEmptyState(tree({ upstream: null, ahead: 0, behind: 0 }), "unborn")).toEqual({
      kind: "unborn",
    });
  });

  it("reports a detached head without offering a publish", () => {
    expect(getChangesEmptyState(tree({ upstream: "origin/main", ahead: 2, behind: 0 }), "detached")).toEqual({
      kind: "detached",
    });
  });

  it("reports no remote when the line has no upstream", () => {
    expect(getChangesEmptyState(tree({ upstream: null, ahead: 0, behind: 0 }))).toEqual({ kind: "no-remote" });
  });

  it("reports unpublished saved versions ahead of the upstream", () => {
    expect(getChangesEmptyState(tree({ upstream: "origin/main", ahead: 4, behind: 0 }))).toEqual({
      kind: "ahead",
      count: 4,
    });
  });

  it("reports newer remote work behind the upstream", () => {
    expect(getChangesEmptyState(tree({ upstream: "origin/main", ahead: 0, behind: 2 }))).toEqual({
      kind: "behind",
      count: 2,
    });
  });

  it("brings changes in before publishing when the line has diverged", () => {
    // Ahead *and* behind: publishing is not the safe next step, so the helper
    // reports the remote-first state even though there is also local work.
    expect(getChangesEmptyState(tree({ upstream: "origin/main", ahead: 3, behind: 1 }))).toEqual({
      kind: "behind",
      count: 1,
    });
  });

  it("reports everything settled when there is nothing to send or receive", () => {
    expect(getChangesEmptyState(tree({ upstream: "origin/main", ahead: 0, behind: 0 }))).toEqual({
      kind: "up-to-date",
    });
  });
});
