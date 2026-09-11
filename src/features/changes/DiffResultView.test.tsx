import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { translations } from "../../i18n";
import { DiffResultView, lineColumns, widestRowColumns } from "./DiffResultView";
import { PictureDiffControls, usePictureDiff } from "./pictureDiff";
import { DiffPreferencesProvider, DEFAULT_DIFF_PREFERENCES, type DiffPreferences } from "./diffPreferences";
import type { DiffHunk, FileDiff, ImagePreview, ImagePreviewSide } from "./domain";

afterEach(cleanup);

const t = translations.en;

/** The only change here is indentation, so ignoring whitespace empties it. */
const indentationHunk: DiffHunk = {
  header: "@@ -1,3 +1,3 @@",
  oldStart: 1,
  oldLines: 3,
  newStart: 1,
  newLines: 3,
  lines: [
    { kind: "context", content: "function f() {", oldLineNumber: 1, newLineNumber: 1 },
    { kind: "deletion", content: "  return 1;", oldLineNumber: 2, newLineNumber: null },
    { kind: "addition", content: "\treturn 1;", oldLineNumber: null, newLineNumber: 2 },
    { kind: "context", content: "}", oldLineNumber: 3, newLineNumber: 3 },
  ],
};

const realChangeHunk: DiffHunk = {
  header: "@@ -10,2 +10,2 @@",
  oldStart: 10,
  oldLines: 2,
  newStart: 10,
  newLines: 2,
  lines: [
    { kind: "deletion", content: "const a = 1;", oldLineNumber: 10, newLineNumber: null },
    { kind: "addition", content: "const a = 2;", oldLineNumber: null, newLineNumber: 10 },
  ],
};

function textDiff(hunks: DiffHunk[]): FileDiff {
  return { kind: "text", path: "src/app.ts", originalPath: null, change: "changed", truncated: false, hunks };
}

const whitespaceOnlyDiff = textDiff([indentationHunk]);
const mixedDiff = textDiff([indentationHunk, realChangeHunk]);

/** The virtualized views render nothing under jsdom — the `ResizeObserver`
 * stub in `testSetup.ts` never fires, so the virtualizer never learns its
 * viewport size. Structure (classes, `tab-size`) is still assertable there;
 * anything about the *content* goes through the accessible view, which is one
 * plain `<pre>` and not virtualized at all. */
function renderDiff(
  preferences: Partial<DiffPreferences> = {},
  viewMode?: "accessible",
  diff: FileDiff = whitespaceOnlyDiff,
) {
  return render(
    <DiffPreferencesProvider value={{ ...DEFAULT_DIFF_PREFERENCES, ...preferences }}>
      <DiffResultView diff={diff} viewMode={viewMode} t={t} />
    </DiffPreferencesProvider>,
  );
}

/** Raw `textContent`, not `toHaveTextContent`: that matcher collapses runs of
 * whitespace, which is the one thing these assertions are about. */
function diffText(): string {
  return document.querySelector(".diff-code")?.textContent ?? "";
}

function scroller(): HTMLElement {
  const element = document.querySelector(".diff-code");
  if (!element) {
    throw new Error("no diff scroller rendered");
  }
  return element as HTMLElement;
}

describe("unwrapped line widths", () => {
  it("counts display columns with tabs expanded to the next stop", () => {
    expect(lineColumns("abc", 8)).toBe(3);
    // A tab advances to the next multiple of the tab size, not by it.
    expect(lineColumns("	abc", 8)).toBe(11);
    expect(lineColumns("ab	c", 8)).toBe(9);
    expect(lineColumns("	abc", 2)).toBe(5);
  });

  it("counts a wide glyph as two columns and a combining mark as none", () => {
    expect(lineColumns("漢字", 8)).toBe(4);
    expect(lineColumns("é", 8)).toBe(1);
  });

  it("finds the widest line for each geometry", () => {
    const rows = [
      { kind: "marker" as const, hunkIndex: 0, hiddenLines: 3, gap: { hiddenLines: 3, oldStart: 1, newStart: 1 } },
      { kind: "line" as const, hunkIndex: 0, line: { kind: "context" as const, content: "short", oldLineNumber: 1, newLineNumber: 1 } },
      { kind: "line" as const, hunkIndex: 0, line: { kind: "addition" as const, content: "	much longer line", oldLineNumber: null, newLineNumber: 2 } },
    ];

    // The marker contributes nothing: it is a chip, not a line of code.
    expect(widestRowColumns(rows, 8)).toEqual({ unified: 8 + "much longer line".length, split: 0 });
  });

  it("measures both halves of a split row against one shared width", () => {
    const rows = [
      {
        kind: "pair" as const,
        hunkIndex: 0,
        left: { kind: "deletion" as const, content: "a", oldLineNumber: 1, newLineNumber: null },
        right: { kind: "addition" as const, content: "a much longer replacement", oldLineNumber: null, newLineNumber: 1 },
      },
    ];

    // One number for both columns, or the divider moves from row to row.
    expect(widestRowColumns(rows, 8)).toEqual({ unified: 0, split: "a much longer replacement".length });
  });
});

describe("DiffResultView reading preferences", () => {
  it("renders today's behaviour with the defaults", () => {
    renderDiff({}, "accessible");

    // Every default has to reproduce what the viewer did before any of this
    // was configurable, or an existing user sees a change they never asked for.
    expect(scroller()).toHaveClass("diff-code--accessible-wrap");
    expect(scroller().style.tabSize).toBe("8");
    expect(diffText()).toContain("-  return 1;");
  });

  it("switches the viewer to horizontal scrolling when wrapping is off", () => {
    renderDiff({ wrapLines: false });

    expect(scroller()).toHaveClass("diff-code--nowrap");
  });

  it("stops wrapping the accessible view too", () => {
    renderDiff({ wrapLines: false }, "accessible");

    // A preference that only held in two views out of three would be a
    // setting that quietly does not apply.
    expect(scroller()).not.toHaveClass("diff-code--accessible-wrap");
  });

  it("carries the tab width onto the element the diff inherits from", () => {
    renderDiff({ tabWidth: 2 });

    // Set on the scroller rather than per line so the metrics reader can find
    // it in the computed style, which is where the row-height estimate for a
    // tab-indented line comes from.
    expect(scroller().style.tabSize).toBe("2");
  });

  it("drops a whitespace-only hunk while keeping the real one", () => {
    renderDiff({ ignoreWhitespace: true }, "accessible", mixedDiff);

    const text = diffText();
    // The re-indented pair collapses to context, which leaves that hunk with
    // no changes in it at all — so it goes, exactly as `git diff -w` would
    // never have emitted it. Its lines are ordinary unchanged context now,
    // reachable through the neighbouring gap markers like any other.
    expect(text).not.toContain("-  return 1;");
    expect(text).not.toContain("return 1;");
    // The real change is untouched.
    expect(text).toContain("-const a = 1;");
    expect(text).toContain("+const a = 2;");
  });

  it("says so rather than going blank when every change was whitespace", () => {
    renderDiff({ ignoreWhitespace: true }, "accessible");

    // Filtering the only hunk away leaves nothing to render, and an empty
    // pane for a file the list says has changed reads as a bug.
    expect(screen.getByRole("heading", { name: "Only spacing changed" })).toBeInTheDocument();
    expect(document.querySelector(".diff-code")).toBeNull();
  });
});

/** A one-pixel PNG and a hostile SVG, as base64 — the two shapes the preview
 * has to handle: something the webview draws, and something a repository can
 * put in front of the app. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const HOSTILE_SVG = btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<script>window.__svgRan = true;</script>' +
    '<image href="https://example.invalid/pixel.png" />' +
    "</svg>",
);

function imageDiff(path = "assets/logo.png"): FileDiff {
  return { kind: "image", path, originalPath: null, change: "changed" };
}

function ready(data: string, mediaType: string, byteLength = 64): ImagePreviewSide {
  return { kind: "ready", mediaType, byteLength, data };
}

/** Stands in for a surface: it owns the picture the way ChangesPanel and
 * History do — the pickers in its own header strip, the pictures in the diff
 * view below — so these tests exercise the wiring the app actually uses. */
function PictureHost({
  diff,
  preview,
  viewMode,
}: {
  diff: FileDiff;
  preview: ImagePreview | null;
  viewMode?: "accessible";
}): React.JSX.Element {
  const picture = usePictureDiff(diff, "test-source", preview === null ? undefined : async () => preview);
  return (
    <DiffPreferencesProvider value={DEFAULT_DIFF_PREFERENCES}>
      <div className="changes-diff__controls">
        {picture && <PictureDiffControls picture={picture} t={t} />}
      </div>
      <DiffResultView diff={diff} picture={picture} viewMode={viewMode} t={t} />
    </DiffPreferencesProvider>
  );
}

function renderImage(diff: FileDiff, preview: ImagePreview | null, viewMode?: "accessible") {
  return render(<PictureHost diff={diff} preview={preview} viewMode={viewMode} />);
}

describe("changed images", () => {
  it("shows both versions as pictures instead of a note", async () => {
    renderImage(imageDiff(), {
      before: ready(PNG_BASE64, "image/png", 90),
      after: ready(PNG_BASE64, "image/png", 120),
    });

    const before = await screen.findByAltText("assets/logo.png before this change");
    const after = screen.getByAltText("assets/logo.png after this change");
    expect(before).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
    expect(after).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
    // The size delta is part of what the picture is being asked, so it is
    // stated next to it rather than left to be worked out.
    expect(screen.getByText(/30 B larger/)).toBeInTheDocument();
  });

  it("offers the three ways to compare, and only when there are two versions", async () => {
    const { unmount } = renderImage(imageDiff(), {
      before: ready(PNG_BASE64, "image/png"),
      after: ready(PNG_BASE64, "image/png"),
    });

    // One picker in the diff language's own style, not a third kind of
    // control: the trigger names itself and its current choice.
    fireEvent.click(await screen.findByRole("button", { name: "How to compare (Side by side)" }));
    expect(screen.getByRole("menuitemradio", { name: "Side by side" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Swipe" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Fade" })).toBeInTheDocument();
    unmount();

    renderImage(imageDiff(), { before: null, after: ready(PNG_BASE64, "image/png") });

    // An added image has nothing to compare against, so the control that
    // compares is not offered at all.
    expect(await screen.findByText("Added")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /How to compare/ })).toBeNull();
    cleanup();

    renderImage(imageDiff(), { before: ready(PNG_BASE64, "image/png"), after: null });

    expect(await screen.findByText("Removed")).toBeInTheDocument();
    expect(screen.getByAltText("assets/logo.png before this change")).toBeInTheDocument();
  });

  it("moves the divider from the keyboard", async () => {
    renderImage(imageDiff(), {
      before: ready(PNG_BASE64, "image/png"),
      after: ready(PNG_BASE64, "image/png"),
    });

    fireEvent.click(await screen.findByRole("button", { name: "How to compare (Side by side)" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Swipe" }));
    const slider = screen.getByRole("slider", { name: "Move the divider" });
    fireEvent.change(slider, { target: { value: "70" } });

    expect(document.querySelector(".image-diff__stage--swipe")).toHaveStyle({
      "--image-diff-position": "70%",
    });
  });

  it("says a version is too large instead of drawing an empty frame", async () => {
    renderImage(imageDiff(), {
      before: { kind: "too-large", byteLength: 20 * 1024 * 1024, limitBytes: 10 * 1024 * 1024 },
      after: ready(PNG_BASE64, "image/png"),
    });

    expect(await screen.findByText(/larger than 10 MB/)).toBeInTheDocument();
  });

  it("keeps the plain note when the surface cannot say which versions to compare", () => {
    renderImage(imageDiff(), null);

    expect(
      screen.getByRole("heading", { name: "This file can’t be previewed as text" }),
    ).toBeInTheDocument();
  });
});

describe("changed SVGs", () => {
  const svgDiff: FileDiff = {
    kind: "text",
    path: "src/assets/icon.svg",
    originalPath: null,
    change: "changed",
    truncated: false,
    hunks: [realChangeHunk],
  };

  it("opens on the drawing and keeps the source one press away", async () => {
    renderImage(
      svgDiff,
      { before: ready(HOSTILE_SVG, "image/svg+xml"), after: ready(HOSTILE_SVG, "image/svg+xml") },
      "accessible",
    );

    expect(await screen.findByAltText("src/assets/icon.svg before this change")).toBeInTheDocument();
    expect(diffText()).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "How to read this file (Drawing)" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Source" }));

    // The text diff that exists today, unchanged, is what Source returns to.
    expect(diffText()).toContain("-const a = 1;");
    expect(screen.queryByAltText("src/assets/icon.svg before this change")).toBeNull();
  });

  it("draws repository SVG through an img, never as markup", async () => {
    renderImage(svgDiff, {
      before: ready(HOSTILE_SVG, "image/svg+xml"),
      after: ready(HOSTILE_SVG, "image/svg+xml"),
    });

    const drawing = await screen.findByAltText("src/assets/icon.svg after this change");
    expect(drawing.tagName).toBe("IMG");
    expect(drawing.getAttribute("src")).toBe(`data:image/svg+xml;base64,${HOSTILE_SVG}`);
    // Nothing from the file reaches the app's own document, which is what
    // keeps a script or a remote reference inside it inert.
    expect(document.querySelector("svg script")).toBeNull();
    expect(document.body.innerHTML).not.toContain("example.invalid");
    expect((window as unknown as { __svgRan?: boolean }).__svgRan).toBeUndefined();
  });
});
