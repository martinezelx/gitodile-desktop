import { describe, expect, it } from "vitest";
import doc from "../../../docs/console-shortcuts.md?raw";
import { DEFAULT_SHORTCUTS, isLineShortcut, shortcutCommand } from "./domain";
import { consoleTranslations } from "./translations";

describe("console shortcuts documentation", () => {
  it("lists every built-in shortcut with what it shows and the Git command it runs", () => {
    const en = consoleTranslations.en;
    const queryLabels: Record<string, string> = {
      status: en.consoleStatus, diff: en.consoleDiff, staged: en.consoleStaged, log: en.consoleLog, graph: en.consoleGraph,
      last: en.consoleLast, branches: en.consoleBranches, tags: en.consoleTags, remotes: en.consoleRemotes,
      stashes: en.consoleStashes, authors: en.consoleAuthors,
    };
    for (const shortcut of DEFAULT_SHORTCUTS) {
      const label = isLineShortcut(shortcut)
        ? en.consoleDefaultLines[shortcut.name as keyof typeof en.consoleDefaultLines]
        : queryLabels[shortcut.operationId];
      expect(doc).toContain(`| \`${shortcut.name}\` | ${label} | \`${shortcutCommand(shortcut)}\` |`);
    }
    const documentedRows = doc.split("\n").filter((line) => /^\| `[a-z-]+` \|/.test(line));
    expect(documentedRows).toHaveLength(DEFAULT_SHORTCUTS.length);
  });
});
