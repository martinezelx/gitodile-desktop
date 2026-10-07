import { describe, expect, it, vi } from "vitest";
import {
  completionsFor, CONSOLE_SHORTCUTS_STORAGE_KEY, DEFAULT_SHORTCUTS, HOSTING_COMMANDS, HOSTING_OPERATION_IDS, isHostingId, isLineShortcut,
  isOperationId, namesByOperation, parseConsoleInput, defaultLineName, OPERATION_IDS, QUERY_COMMANDS, queryCommand, readShortcuts,
  SHORTCUT_CATALOGUE, SHORTCUT_LIMIT, shortcutCommand, shortcutNameIssue, widensTier, writeShortcuts,
} from "./domain";

describe("console shortcuts", () => {
  it("accepts one exact name, or hands a whole git line to Rust untouched", () => {
    expect(parseConsoleInput(" look ", DEFAULT_SHORTCUTS)).toEqual({ kind: "query", shortcut: DEFAULT_SHORTCUTS[0] });
    expect(parseConsoleInput("help", DEFAULT_SHORTCUTS)).toEqual({ kind: "help" });
    expect(parseConsoleInput("help  git", DEFAULT_SHORTCUTS)).toEqual({ kind: "help-git" });
    expect(parseConsoleInput("git", DEFAULT_SHORTCUTS)).toEqual({ kind: "help-git" });
    expect(parseConsoleInput("  git log  --format='%h %s'; rm ", DEFAULT_SHORTCUTS)).toEqual({ kind: "git", line: "git log  --format='%h %s'; rm" });
    for (const input of ["stat && push", "stat; rm -rf", "STAT", "diff --cached", "$(echo stat)", "gitk", "git-lfs"]) {
      expect(parseConsoleInput(input, DEFAULT_SHORTCUTS).kind).toBe("unknown");
    }
  });

  it("keeps command-line shortcuts with their tier, and drops malformed ones", () => {
    const stored = (shortcuts: unknown[]) => ({ getItem: () => JSON.stringify({ catalogue: [...SHORTCUT_CATALOGUE], shortcuts }) });
    const lg = { name: "lg", line: "git log --oneline -20", tier: "read" };
    expect(readShortcuts(stored([lg]))).toEqual([lg]);
    expect(parseConsoleInput("lg", [lg as never])).toEqual({ kind: "query", shortcut: lg });
    for (const broken of [
      { name: "lg", line: "rm -rf /", tier: "read" },
      { name: "lg", line: "git log", tier: "never" },
      { name: "lg", line: "git log", tier: "admin" },
      { name: "lg", line: `git log ${"x".repeat(5000)}`, tier: "read" },
      { name: "git", line: "git log", tier: "read" },
    ]) {
      expect(readShortcuts(stored([broken]))).toEqual(DEFAULT_SHORTCUTS);
    }
    expect(shortcutNameIssue("git", DEFAULT_SHORTCUTS)).toBe("reserved");
  });

  it("never lets a later plan widen the tier a shortcut was saved with", () => {
    expect(widensTier("read", "read")).toBe(false);
    expect(widensTier("read", "local_change")).toBe(true);
    expect(widensTier("read", "destructive")).toBe(true);
    expect(widensTier("destructive", "read")).toBe(false);
  });

  it("validates custom names and restores defaults for malformed stored data", () => {
    expect(shortcutNameIssue("help", DEFAULT_SHORTCUTS)).toBe("reserved");
    expect(shortcutNameIssue("look", DEFAULT_SHORTCUTS)).toBe("duplicate");
    expect(shortcutNameIssue("My Alias", DEFAULT_SHORTCUTS)).toBe("invalid");
    expect(shortcutNameIssue("look", DEFAULT_SHORTCUTS, "look")).toBeNull();
    const storage = { getItem: vi.fn(() => JSON.stringify([{ name: "danger", operationId: "push" }])) };
    expect(readShortcuts(storage)).toEqual(DEFAULT_SHORTCUTS);
    storage.getItem.mockReturnValue(JSON.stringify({ catalogue: [...SHORTCUT_CATALOGUE], shortcuts: [{ name: "st", operationId: "status" }] }));
    expect(readShortcuts(storage)).toEqual([{ name: "st", operationId: "status" }]);
    expect(readShortcuts({ getItem: () => { throw new Error("storage unavailable"); } })).toEqual(DEFAULT_SHORTCUTS);
  });

  it("gives names saved before a catalogue grew the new queries, keeping what they removed", () => {
    const firstFormat = JSON.stringify([{ name: "stat", operationId: "status" }, { name: "look", operationId: "status" }, { name: "graph", operationId: "log" }]);
    const names = readShortcuts({ getItem: () => firstFormat });
    expect(names.slice(0, 3).map((item) => item.name)).toEqual(["stat", "look", "graph"]);
    // "diff" and "branches" were known and removed; "graph" is taken, so the graph query gets no name.
    // Their own "stat" keeps the built-in line of that name out as well.
    expect(names.slice(3).map((item) => item.name)).toEqual([
      "staged", "last", "tags", "remotes", "stashes", "authors",
      "prs", "my-prs", "issues", "runs", "checks", "repo",
      "short", "today", "week", "unpublished", "incoming", "moves", "all-lines", "size",
    ]);
    const current = JSON.stringify({ catalogue: [...SHORTCUT_CATALOGUE], shortcuts: [{ name: "look", operationId: "status" }] });
    expect(readShortcuts({ getItem: () => current })).toEqual([{ name: "look", operationId: "status" }]);
  });

  it("brings the built-in command lines to lists saved before them, not back to those who removed them", () => {
    const beforeLines = JSON.stringify({ catalogue: [...OPERATION_IDS], shortcuts: [{ name: "look", operationId: "status" }] });
    expect(readShortcuts({ getItem: () => beforeLines }).map((item) => item.name))
      .toEqual([
        "look", "prs", "my-prs", "issues", "runs", "checks", "repo",
        "short", "stat", "today", "week", "unpublished", "incoming", "moves", "all-lines", "size",
      ]);
    const removedToday = JSON.stringify({ catalogue: [...SHORTCUT_CATALOGUE], shortcuts: [{ name: "look", operationId: "status" }] });
    expect(readShortcuts({ getItem: () => removedToday })).toEqual([{ name: "look", operationId: "status" }]);
  });

  it("recognises a renamed built-in line by its command", () => {
    expect(defaultLineName({ name: "hoy", line: "git log --oneline --since=midnight", tier: "read" })).toBe("today");
    expect(defaultLineName({ name: "today", line: "git log -1", tier: "read" })).toBeNull();
    expect(defaultLineName({ name: "look", operationId: "status" })).toBeNull();
  });

  it("names the command every shortcut runs", () => {
    for (const shortcut of DEFAULT_SHORTCUTS) {
      expect(shortcutCommand(shortcut)).toMatch(isLineShortcut(shortcut) || !isHostingId(shortcut.operationId) ? /^git [a-z]/ : /^gh [a-z].* · glab [a-z]/);
    }
    expect(shortcutCommand({ name: "look", operationId: "status" })).toBe("git status");
    expect(shortcutCommand({ name: "lg", line: "git log --oneline -20", tier: "read" })).toBe("git log --oneline -20");
    expect(Object.keys(QUERY_COMMANDS)).toEqual([...OPERATION_IDS]);
    expect(Object.keys(HOSTING_COMMANDS)).toEqual([...HOSTING_OPERATION_IDS]);
  });

  it("names the CLI for the project's provider once it is known", () => {
    expect(queryCommand("prs", "github")).toBe("gh pr list --limit 20");
    expect(queryCommand("prs", "gitlab")).toBe("glab mr list --per-page 20");
    expect(queryCommand("prs", "bitbucket")).toBe("gh pr list --limit 20 · glab mr list --per-page 20");
    expect(queryCommand("prs")).toBe("gh pr list --limit 20 · glab mr list --per-page 20");
    expect(queryCommand("status", "github")).toBe("git status");
    expect(isOperationId("my-prs")).toBe(true);
    expect(isOperationId("api")).toBe(false);
  });

  it("keeps every built-in name within the limit, with room for a few of one's own", () => {
    expect(DEFAULT_SHORTCUTS.length).toBeLessThanOrEqual(SHORTCUT_LIMIT - 4);
  });

  it("writes a versioned app preference, never Git config", () => {
    const storage = { setItem: vi.fn() };
    expect(writeShortcuts(DEFAULT_SHORTCUTS, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(CONSOLE_SHORTCUTS_STORAGE_KEY, JSON.stringify({ catalogue: SHORTCUT_CATALOGUE, shortcuts: DEFAULT_SHORTCUTS }));
    expect(writeShortcuts(DEFAULT_SHORTCUTS, { setItem: () => { throw new Error("storage unavailable"); } })).toBe(false);
  });
});

describe("console completion", () => {
  it("extends what was typed, shortcuts before console actions", () => {
    const shortcuts = [{ name: "stat", operationId: "status" as const }, { name: "sh", operationId: "log" as const }];
    expect(completionsFor("s", shortcuts).map((item) => item.name)).toEqual(["stat", "sh", "shortcuts", "settings"]);
    expect(completionsFor("git ", shortcuts).map((item) => item.name)).toEqual(["git status", "git log", "git show", "git diff", "git blame", "git grep"]);
    expect(completionsFor("git  lo", shortcuts).map((item) => item.name)).toEqual(["git  log"]);
    expect(completionsFor("git stash ", shortcuts).map((item) => item.name)).toEqual(["git stash list", "git stash show"]);
    expect(completionsFor("git log", shortcuts)).toEqual([]);
    expect(completionsFor("git log -", shortcuts)).toEqual([]);
    expect(completionsFor("stat", shortcuts)).toEqual([]);
    expect(completionsFor("s t", shortcuts)).toEqual([]);
    expect(completionsFor("", shortcuts)).toEqual([]);
  });

  it("groups aliases by the query they reach", () => {
    expect(namesByOperation([{ name: "stat", operationId: "status" }, { name: "log", operationId: "log" }, { name: "look", operationId: "status" }]))
      .toEqual([{ operationId: "status", names: ["stat", "look"] }, { operationId: "log", names: ["log"] }]);
  });
});
