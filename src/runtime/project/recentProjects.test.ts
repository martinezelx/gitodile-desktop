import { beforeEach, describe, expect, it } from "vitest";

import {
  RECENT_PROJECTS_LIMIT,
  forgetRecentProject,
  readRecentProjects,
  rememberRecentProject,
} from "./recentProjects";

describe("recent projects storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(readRecentProjects()).toEqual([]);
  });

  it("keeps the newest opened project first", () => {
    rememberRecentProject({ path: "/a", name: "a" });
    rememberRecentProject({ path: "/b", name: "b" });

    expect(readRecentProjects()).toEqual([
      { path: "/b", name: "b" },
      { path: "/a", name: "a" },
    ]);
  });

  it("promotes a reopened project instead of duplicating it, and takes its current name", () => {
    rememberRecentProject({ path: "/a", name: "a" });
    rememberRecentProject({ path: "/b", name: "b" });
    rememberRecentProject({ path: "/a", name: "a-renamed" });

    expect(readRecentProjects()).toEqual([
      { path: "/a", name: "a-renamed" },
      { path: "/b", name: "b" },
    ]);
  });

  it("forgets exactly one entry and leaves the rest in order", () => {
    for (const path of ["/a", "/b", "/c"]) rememberRecentProject({ path, name: path });

    expect(forgetRecentProject("/b")).toEqual([
      { path: "/c", name: "/c" },
      { path: "/a", name: "/a" },
    ]);
    expect(readRecentProjects()).toHaveLength(2);
  });

  it("caps the list at the limit, dropping the oldest", () => {
    for (let index = 0; index <= RECENT_PROJECTS_LIMIT; index += 1) {
      rememberRecentProject({ path: `/p${index}`, name: `p${index}` });
    }

    const entries = readRecentProjects();
    expect(entries).toHaveLength(RECENT_PROJECTS_LIMIT);
    expect(entries[0].path).toBe(`/p${RECENT_PROJECTS_LIMIT}`);
    expect(entries.some((entry) => entry.path === "/p0")).toBe(false);
  });

  it("treats corrupt JSON and an unrecognized schema as nothing stored", () => {
    localStorage.setItem("gitodrile-recent-projects", "{not json");
    expect(readRecentProjects()).toEqual([]);

    localStorage.setItem(
      "gitodrile-recent-projects",
      JSON.stringify({ version: 2, entries: [{ path: "/a", name: "a" }] }),
    );
    expect(readRecentProjects()).toEqual([]);
  });

  it("rejects entries that are not a path and a name", () => {
    localStorage.setItem(
      "gitodrile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: "/a" }] }),
    );
    expect(readRecentProjects()).toEqual([]);
  });
});
