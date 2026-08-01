import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  initialProjectSessionsState,
  projectSessionsReducer,
  projectSessionsStateToStored,
  readStoredProjects,
  shouldRefreshOnWatchEvent,
  writeStoredProjects,
  type ProjectSessionsState,
} from "./projectSessions";
import type { RepositoryInfo } from "./repositoryOverview";
import type { VersionLinesSnapshot } from "./versionLines";

function makeProject(path: string, overrides: Partial<RepositoryInfo> = {}): RepositoryInfo {
  return {
    name: path.split("/").pop() ?? path,
    path,
    selectedPath: path,
    gitDir: `${path}/.git`,
    commonGitDir: `${path}/.git`,
    branch: "main",
    headState: "branch",
    kind: "repository",
    ...overrides,
  };
}

const versionLines: VersionLinesSnapshot = {
  branch: "main",
  headState: "branch",
  currentCommit: "abc123",
  lines: [
    {
      name: "main",
      tip: { commit: "abc123", shortCommit: "abc123a", subject: "first", committedAt: "2026-07-01T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      uniqueCommitCount: null,
      worktreePath: null,
    },
  ],
  totalCount: 1,
  isTruncated: false,
  unreadableCount: 0,
};

describe("projectSessionsReducer", () => {
  it("opens a new project as the active session", () => {
    const state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    expect(state.order).toEqual(["/a"]);
    expect(state.activeId).toBe("/a");
    expect(state.byId["/a"].project.path).toBe("/a");
    expect(state.byId["/a"].workingTree).toBeNull();
    expect(state.byId["/a"].pendingVersions).toEqual(EMPTY_PENDING_VERSIONS);
  });

  it("activates an already-open worktree instead of duplicating it", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/a", { branch: "feature" }),
    });
    expect(state.order).toEqual(["/a", "/b"]);
    expect(state.activeId).toBe("/a");
    // Repository facts refresh even for a dedup-activated session.
    expect(state.byId["/a"].project.branch).toBe("feature");
  });

  it("ignores activating an id that isn't open", () => {
    const state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    const next = projectSessionsReducer(state, { type: "activate", id: "/nope" });
    expect(next).toBe(state);
  });

  it("closing the active session selects the next adjacent session", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "activate", id: "/b" });
    state = projectSessionsReducer(state, { type: "close", id: "/b" });
    expect(state.order).toEqual(["/a", "/c"]);
    expect(state.activeId).toBe("/c");
  });

  it("closing the last session in order falls back to the new last session", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    // activeId is already "/c" (last opened).
    state = projectSessionsReducer(state, { type: "close", id: "/c" });
    expect(state.activeId).toBe("/b");
  });

  it("closing the only open session returns to the no-project state", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "close", id: "/a" });
    expect(state.order).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.byId["/a"]).toBeUndefined();
  });

  it("closing an inactive session leaves the active session untouched", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "activate", id: "/a" });
    state = projectSessionsReducer(state, { type: "close", id: "/b" });
    expect(state.activeId).toBe("/a");
    expect(state.order).toEqual(["/a"]);
  });

  it("reorders a session to a new index", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "reorder", id: "/c", toIndex: 0 });
    expect(state.order).toEqual(["/c", "/a", "/b"]);
  });

  it("restores a stored session list by opening each in order and re-activating the stored active id", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    // Restoring lands on the last-opened project by default...
    expect(state.activeId).toBe("/c");
    // ...unless the stored active id says otherwise.
    state = projectSessionsReducer(state, { type: "activate", id: "/b" });
    expect(state.activeId).toBe("/b");
  });

  it("skips an unreadable stored path without disturbing the rest of the restore", () => {
    let state = initialProjectSessionsState;
    // "/missing" simply never gets an "open" dispatched for it (the caller
    // couldn't reopen it), which is exactly how a partial restore failure
    // is expressed against this reducer.
    for (const path of ["/a", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    expect(state.order).toEqual(["/a", "/c"]);
    expect(Object.keys(state.byId)).toHaveLength(2);
  });

  it("applies a status result only when its generation still matches", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", generation: 1 });
    expect(state.byId["/a"].isCheckingChanges).toBe(true);

    // A second, newer refresh starts before the first resolves.
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", generation: 2 });

    // The stale (generation 1) response arrives late and must be ignored.
    const staleWorkingTree = {
      isClean: false,
      counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
      entries: [],
      truncated: false,
      hasPreparedChanges: false,
      hasUnpreparedChanges: true,
      upstream: { branch: null, upstream: null, ahead: 0, behind: 0 },
    };
    const afterStale = projectSessionsReducer(state, {
      type: "applyWorkingTree",
      id: "/a",
      generation: 1,
      workingTree: staleWorkingTree,
    });
    expect(afterStale).toBe(state);
    expect(afterStale.byId["/a"].workingTree).toBeNull();
    expect(afterStale.byId["/a"].isCheckingChanges).toBe(true);

    // The current (generation 2) response is applied normally.
    const freshWorkingTree = { ...staleWorkingTree, isClean: true };
    const afterFresh = projectSessionsReducer(state, {
      type: "applyWorkingTree",
      id: "/a",
      generation: 2,
      workingTree: freshWorkingTree,
    });
    expect(afterFresh.byId["/a"].workingTree).toEqual(freshWorkingTree);
    expect(afterFresh.byId["/a"].isCheckingChanges).toBe(false);
  });

  it("keeps the last known working tree when a refresh fails", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    const workingTree = {
      isClean: true,
      counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
      entries: [],
      truncated: false,
      hasPreparedChanges: false,
      hasUnpreparedChanges: false,
      upstream: { branch: null, upstream: null, ahead: 0, behind: 0 },
    };
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", generation: 1 });
    state = projectSessionsReducer(state, { type: "applyWorkingTree", id: "/a", generation: 1, workingTree });
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", generation: 2 });
    state = projectSessionsReducer(state, {
      type: "applyWorkingTreeError",
      id: "/a",
      generation: 2,
      error: "network blip",
    });
    expect(state.byId["/a"].workingTree).toEqual(workingTree);
    expect(state.byId["/a"].workingTreeError).toBe("network blip");
    expect(state.byId["/a"].isCheckingChanges).toBe(false);
  });

  it("keeps the last known version lines visible when a refresh fails", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    expect(state.byId["/a"].versionLines).toBeNull();

    state = projectSessionsReducer(state, { type: "startVersionLinesLoad", id: "/a", generation: 1 });
    expect(state.byId["/a"].isLoadingVersionLines).toBe(true);
    state = projectSessionsReducer(state, {
      type: "applyVersionLines",
      id: "/a",
      generation: 1,
      snapshot: versionLines,
    });
    expect(state.byId["/a"].versionLines).toEqual(versionLines);
    expect(state.byId["/a"].isLoadingVersionLines).toBe(false);

    state = projectSessionsReducer(state, { type: "startVersionLinesLoad", id: "/a", generation: 2 });
    state = projectSessionsReducer(state, {
      type: "applyVersionLinesError",
      id: "/a",
      generation: 2,
      error: "git blip",
    });
    expect(state.byId["/a"].versionLines).toEqual(versionLines);
    expect(state.byId["/a"].versionLinesError).toBe("git blip");
    expect(state.byId["/a"].isLoadingVersionLines).toBe(false);
  });

  it("drops a superseded version-lines response instead of clobbering a newer one", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "startVersionLinesLoad", id: "/a", generation: 1 });
    state = projectSessionsReducer(state, { type: "startVersionLinesLoad", id: "/a", generation: 2 });

    const stale = projectSessionsReducer(state, {
      type: "applyVersionLines",
      id: "/a",
      generation: 1,
      snapshot: versionLines,
    });
    expect(stale).toBe(state);
    expect(stale.byId["/a"].versionLines).toBeNull();
  });

  it("keeps each session's version lines separate from the working-tree generation", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "startVersionLinesLoad", id: "/a", generation: 1 });
    // A working-tree refresh runs its own counter; it must not invalidate the
    // version-lines read already in flight.
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", generation: 7 });
    state = projectSessionsReducer(state, {
      type: "applyVersionLines",
      id: "/a",
      generation: 1,
      snapshot: versionLines,
    });
    expect(state.byId["/a"].versionLines).toEqual(versionLines);
  });

  it("answers a watch event only when no operation owns the working tree", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(true);

    // A local mutation writes repository state itself; refreshing underneath
    // it would show a half-finished tree or move the ground under a plan being
    // confirmed. Version-line operations use the same coordination contract
    // as save and publish.
    state = projectSessionsReducer(state, { type: "startOperation", id: "/a", kind: "version-line" });
    expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(false);
    for (const phase of ["executing", "verifying", "uncertain"] as const) {
      state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase });
      expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(false);
    }

    // Settled phases only linger because the dialog is still open.
    for (const phase of ["error", "success"] as const) {
      state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase });
      expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(true);
    }

    // An event for a project that isn't open is simply dropped.
    expect(shouldRefreshOnWatchEvent(state.byId["/gone"])).toBe(false);
  });

  it("remembers the last view and changes selection per session", () => {
    let state: ProjectSessionsState = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "navigate", id: "/a", view: "changes" });
    state = projectSessionsReducer(state, {
      type: "setChangesSelection",
      id: "/a",
      selection: { selectedPath: "src/main.tsx", excludedPaths: ["README.md"] },
    });
    expect(state.byId["/a"].lastView).toBe("changes");
    expect(state.byId["/a"].changesSelection).toEqual({ selectedPath: "src/main.tsx", excludedPaths: ["README.md"] });
    expect(state.byId["/b"].lastView).toBe("overview");
  });

  it("keeps independent back and forward history for each project", () => {
    let state = initialProjectSessionsState;
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "navigate", id: "/a", view: "changes" });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });

    state = projectSessionsReducer(state, { type: "goBack", id: "/a" });
    expect(state.byId["/a"].lastView).toBe("overview");
    expect(state.byId["/b"].lastView).toBe("overview");

    state = projectSessionsReducer(state, { type: "goForward", id: "/a" });
    expect(state.byId["/a"].lastView).toBe("changes");
  });

  it("blocks concurrent mutations that share a common Git directory", () => {
    let state = initialProjectSessionsState;
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/worktree-a", { commonGitDir: "/repo/.git" }),
    });
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/worktree-b", { commonGitDir: "/repo/.git" }),
    });
    state = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-a",
      kind: "version-line",
    });

    expect(getMutationBlocker(state, "/worktree-b")?.id).toBe("/worktree-a");
    const blocked = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-b",
      kind: "publish",
    });
    expect(blocked).toBe(state);

    state = projectSessionsReducer(state, { type: "finishOperation", id: "/worktree-a" });
    state = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-b",
      kind: "publish",
    });
    expect(state.byId["/worktree-b"].operation).toEqual({
      kind: "publish",
      phase: "planning",
    });
  });
});

describe("project storage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips the current session order and active id", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    writeStoredProjects(projectSessionsStateToStored(state));
    expect(readStoredProjects()).toEqual({ version: 1, order: ["/a", "/b"], activeId: "/b" });
  });

  it("returns an empty list when nothing is stored", () => {
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });

  it("migrates the legacy single-project key exactly once", () => {
    localStorage.setItem("gitodrile-last-project-path", "/old/project");
    expect(readStoredProjects()).toEqual({ version: 1, order: ["/old/project"], activeId: "/old/project" });
    expect(localStorage.getItem("gitodrile-last-project-path")).toBeNull();
    expect(localStorage.getItem("gitodrile-projects")).not.toBeNull();
  });

  it("treats corrupt JSON under the new key as nothing stored", () => {
    localStorage.setItem("gitodrile-projects", "{not json");
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });

  it("treats an unrecognized schema version as nothing stored", () => {
    localStorage.setItem("gitodrile-projects", JSON.stringify({ version: 2, order: ["/a"], activeId: "/a" }));
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });
});
