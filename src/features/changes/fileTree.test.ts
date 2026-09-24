import { describe, expect, it } from "vitest";

import { flattenFileTree, isGroupedFileRow } from "./fileTree";

const paths = [
  "src/features/history/HistoryPanel.tsx",
  "src/features/history/history.css",
  "src/features/version-lines/panel.tsx",
  "src/app/App.tsx",
  "DESIGN.md",
  "docs/adr/0003.md",
];
const identity = (path: string): string => path;

function describeRows(collapsed: string[] = []): string[] {
  return flattenFileTree(paths, identity, new Set(collapsed)).map((row) =>
    `${"  ".repeat(row.depth)}${row.kind === "folder" ? `${row.label}/ (${row.files.length})` : row.path.split("/").pop()}`);
}

describe("flattenFileTree", () => {
  it("draws folders before files, each by name, and compacts chains of lone folders", () => {
    expect(describeRows()).toEqual([
      "docs/adr/ (1)",
      "  0003.md",
      "src/ (4)",
      "  app/ (1)",
      "    App.tsx",
      "  features/ (3)",
      "    history/ (2)",
      "      history.css",
      "      HistoryPanel.tsx",
      "    version-lines/ (1)",
      "      panel.tsx",
      "DESIGN.md",
    ]);
  });

  it("leaves a collapsed folder's contents out but still counts them", () => {
    expect(describeRows(["src/features"])).toEqual([
      "docs/adr/ (1)",
      "  0003.md",
      "src/ (4)",
      "  app/ (1)",
      "    App.tsx",
      "  features/ (3)",
      "DESIGN.md",
    ]);
  });

  it("keys a compacted chain by its deepest folder", () => {
    const rows = flattenFileTree(paths, identity, new Set(["docs/adr"]));
    expect(rows[0]).toMatchObject({ kind: "folder", label: "docs/adr", path: "docs/adr", expanded: false });
    expect(rows[1]).toMatchObject({ kind: "folder", label: "src" });
  });

  it("leaves the root's own files loose and ungrouped, so they keep the list's shape", () => {
    const rows = flattenFileTree(["src/a.ts", "README.md"], identity, new Set());
    expect(rows.map((row) => `${row.kind}:${row.path}:${row.depth}:${isGroupedFileRow(true, row)}`)).toEqual([
      "folder:src:0:false",
      "file:src/a.ts:1:true",
      "file:README.md:0:false",
    ]);
  });
});
