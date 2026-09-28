import { describe, expect, it, vi } from "vitest";
import {
  completionsFor, CONSOLE_SHORTCUTS_STORAGE_KEY, DEFAULT_SHORTCUTS, namesByOperation, parseConsoleInput,
  OPERATION_IDS, readShortcuts, shortcutNameIssue, writeShortcuts,
} from "./domain";

describe("console shortcuts", () => {
  it("accepts one exact name and never treats a Git or shell line as input", () => {
    expect(parseConsoleInput(" look ", DEFAULT_SHORTCUTS)).toEqual({ kind: "query", shortcut: DEFAULT_SHORTCUTS[0] });
    expect(parseConsoleInput("help", DEFAULT_SHORTCUTS)).toEqual({ kind: "help" });
    for (const input of ["git status", "stat && push", "stat; rm -rf", "STAT", "diff --cached", "$(echo stat)"]) {
      expect(parseConsoleInput(input, DEFAULT_SHORTCUTS).kind).toBe("unknown");
    }
  });

  it("validates custom names and restores defaults for malformed stored data", () => {
    expect(shortcutNameIssue("help", DEFAULT_SHORTCUTS)).toBe("reserved");
    expect(shortcutNameIssue("look", DEFAULT_SHORTCUTS)).toBe("duplicate");
    expect(shortcutNameIssue("My Alias", DEFAULT_SHORTCUTS)).toBe("invalid");
    expect(shortcutNameIssue("look", DEFAULT_SHORTCUTS, "look")).toBeNull();
    const storage = { getItem: vi.fn(() => JSON.stringify([{ name: "danger", operationId: "push" }])) };
    expect(readShortcuts(storage)).toEqual(DEFAULT_SHORTCUTS);
    storage.getItem.mockReturnValue(JSON.stringify({ catalogue: [...OPERATION_IDS], shortcuts: [{ name: "st", operationId: "status" }] }));
    expect(readShortcuts(storage)).toEqual([{ name: "st", operationId: "status" }]);
    expect(readShortcuts({ getItem: () => { throw new Error("storage unavailable"); } })).toEqual(DEFAULT_SHORTCUTS);
  });

  it("gives names saved before a catalogue grew the new queries, keeping what they removed", () => {
    const firstFormat = JSON.stringify([{ name: "stat", operationId: "status" }, { name: "look", operationId: "status" }, { name: "graph", operationId: "log" }]);
    const names = readShortcuts({ getItem: () => firstFormat });
    expect(names.slice(0, 3).map((item) => item.name)).toEqual(["stat", "look", "graph"]);
    // "diff" and "branches" were known and removed; "graph" is taken, so the graph query gets no name.
    expect(names.slice(3).map((item) => item.name)).toEqual(["staged", "last", "tags", "remotes", "stashes", "authors"]);
    const current = JSON.stringify({ catalogue: [...OPERATION_IDS], shortcuts: [{ name: "look", operationId: "status" }] });
    expect(readShortcuts({ getItem: () => current })).toEqual([{ name: "look", operationId: "status" }]);
  });

  it("writes a versioned app preference, never Git config", () => {
    const storage = { setItem: vi.fn() };
    expect(writeShortcuts(DEFAULT_SHORTCUTS, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(CONSOLE_SHORTCUTS_STORAGE_KEY, JSON.stringify({ catalogue: OPERATION_IDS, shortcuts: DEFAULT_SHORTCUTS }));
    expect(writeShortcuts(DEFAULT_SHORTCUTS, { setItem: () => { throw new Error("storage unavailable"); } })).toBe(false);
  });
});

describe("console completion", () => {
  it("extends what was typed, shortcuts before console actions", () => {
    const shortcuts = [{ name: "stat", operationId: "status" as const }, { name: "sh", operationId: "log" as const }];
    expect(completionsFor("s", shortcuts).map((item) => item.name)).toEqual(["stat", "sh", "shortcuts"]);
    expect(completionsFor("stat", shortcuts)).toEqual([]);
    expect(completionsFor("s t", shortcuts)).toEqual([]);
    expect(completionsFor("", shortcuts)).toEqual([]);
  });

  it("groups aliases by the query they reach", () => {
    expect(namesByOperation([{ name: "stat", operationId: "status" }, { name: "log", operationId: "log" }, { name: "look", operationId: "status" }]))
      .toEqual([{ operationId: "status", names: ["stat", "look"] }, { operationId: "log", names: ["log"] }]);
  });
});
