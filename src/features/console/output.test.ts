import { describe, expect, it } from "vitest";
import { highlightOutput, MAX_OUTPUT_SEGMENTS } from "./output";

describe("highlightOutput", () => {
  it("colours status paths by the section they belong to", () => {
    const text = "On branch main\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n\tnew file:   a.txt\n\nChanges not staged for commit:\n\tmodified:   b.txt\n\nUntracked files:\n\tc.txt\n";
    const segments = highlightOutput("status", text) ?? [];
    const toneOf = (fragment: string) => segments.find((segment) => segment.text.includes(fragment))?.tone;
    expect(toneOf("main")).toBe("current");
    expect(toneOf("a.txt")).toBe("staged");
    expect(toneOf("b.txt")).toBe("modified");
    expect(toneOf("c.txt")).toBe("untracked");
    expect(toneOf("git restore")).toBe("hint");
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
  });

  it("keeps the text intact and merges runs of one tone", () => {
    const text = "diff --git a/x b/x\n@@ -1 +1 @@\n-a\n-b\n+c\n context";
    const segments = highlightOutput("commits", text) ?? [];
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.map((segment) => segment.tone)).toEqual(["meta", "hunk", "removed", "added", "plain"]);
    expect(highlightOutput("commits", "abc1234 Subject")).toEqual([{ text: "abc1234", tone: "hash" }, { text: " Subject", tone: "plain" }]);
    expect(highlightOutput("branches", "* main\n  topic")?.[0]).toEqual({ text: "* main\n", tone: "current" });
  });

  it("gives up colouring when the output would need too many runs", () => {
    const text = Array.from({ length: MAX_OUTPUT_SEGMENTS + 1 }, (_, index) => (index % 2 ? "+a" : "-b")).join("\n");
    expect(highlightOutput("commits", text)).toBeNull();
  });

  it("colours the added queries' known shapes", () => {
    expect(highlightOutput("graph", "* 1a2b3c4 (HEAD -> main) First\n| * 5d6e7f8 Other")?.map((segment) => segment.tone))
      .toEqual(["hint", "hash", "plain", "hint", "hash", "plain"]);
    const show = highlightOutput("commits", "commit 1a2b3c4d\nAuthor: A <a@b>\n\n    Subject\n\n file.txt | 3 ++-") ?? [];
    expect(show.find((segment) => segment.text.startsWith("1a2b3c4d"))?.tone).toBe("hash");
    expect(show.find((segment) => segment.text.startsWith("Author"))?.tone).toBe("meta");
    expect(show.find((segment) => segment.text === "++")?.tone).toBe("added");
    expect(highlightOutput("stashes", "stash@{0}: WIP on main")?.[0]).toEqual({ text: "stash@{0}", tone: "hash" });
    expect(highlightOutput("authors", "     3\tAda")?.[0]).toEqual({ text: "     3", tone: "hash" });
    expect(highlightOutput("commits", "+new")?.[0]).toEqual({ text: "+new", tone: "added" });
  });
});
