import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createHistoryController } from "./controller";
import type { HistoryPage, HistoryState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { HistoryPanel } from "./HistoryPanel";
import { formatHistoryDate } from "./formatHistoryDate";
import type { HistoryPort } from "./port";

function metaOrder(row: HTMLElement, meta: string): string[] {
  return [...row.querySelectorAll<HTMLElement>(`${meta} > *`)].map((element) => element.className.split(" ")[0]);
}

function version(index: number): SavedVersionSummary {
  const commit = index.toString(16).padStart(40, "0");
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    parents: index === 0 ? [] : [(index - 1).toString(16).padStart(40, "0")],
    subject: `Saved version ${index}`,
    description: index === 1 ? "Primera línea\nSegunda línea ✓" : "",
    author: { name: "Ada Lovelace", email: "ada@example.test" },
    authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    decorations: index === 0 ? [{ kind: "tag", name: "v1.0", fullRef: "refs/tags/v1.0" }] : [],
    isRoot: index === 0,
    isMerge: false,
    publication: index % 2 ? "local-only" : "published",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

function page(count: number, overrides: Partial<HistoryPage> = {}): HistoryPage {
  const versions = Array.from({ length: count }, (_, index) => version(count - index - 1));
  return {
    repositoryId: "/repo",
    snapshotToken: "snapshot-1",
    branch: "main",
    headState: "branch",
    headCommit: versions[0]?.commit ?? null,
    upstream: { remote: "origin", destinationBranch: "main", trackingRef: "refs/remotes/origin/main", commit: version(0).commit },
    versions,
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
    ...overrides,
  };
}

function state(count: number, overrides: Partial<HistoryState> = {}): HistoryState {
  const historyPage = page(count);
  const { versions, ...snapshot } = historyPage;
  return {
    projectId: "/repo",
    sessionEpoch: "epoch-1",
    snapshot,
    versions,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    moreError: null,
    staleNotice: false,
    clientTruncated: false,
    selectedCommit: versions[0]?.commit ?? null,
    selectedFilePath: null,
    selectionRemoved: false,
    detail: { detail: null, isLoading: false, error: null },
    fileDiff: { diff: null, isLoading: false, error: null },
    scrollOffset: 0,
    generation: 1,
    ...overrides,
  };
}

function controller() {
  const port: HistoryPort = {
    readPage: vi.fn(async () => page(1)),
    readDetail: vi.fn(async () => { throw new Error("not expected"); }),
    readFileDiff: vi.fn(async () => { throw new Error("not expected"); }),
  };
  return createHistoryController(port);
}

function renderPanel(historyState: HistoryState, error: string | null = null, watcherState: "starting" | "watching" | "off" | "unavailable" = "watching") {
  const historyController = controller();
  const select = vi.spyOn(historyController, "selectVersion");
  const selectFile = vi.spyOn(historyController, "selectFile");
  const utils = render(
    <LanguageProvider>
      <HistoryPanel
        controller={historyController}
        query={{ projectId: "/repo", sessionEpoch: "epoch-1" }}
        state={historyState}
        watcherState={watcherState}
        onOpenSettings={() => {}}
        error={error}
      />
    </LanguageProvider>,
  );
  return { historyController, select, selectFile, ...utils };
}

afterEach(cleanup);

describe("HistoryPanel", () => {
  it("shows the empty, initial-loading, and cached-error states truthfully", () => {
    const first = renderPanel(state(0));
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    first.unmount();

    const loading = state(0, { snapshot: null, isLoading: true });
    const second = renderPanel(loading);
    expect(screen.getAllByText("Reading saved versions…")).toHaveLength(2);
    second.unmount();

    renderPanel(state(1, { error: new Error("failed") }), "Last successful result is still shown.");
    expect(screen.getByText("Last successful result is still shown.")).toBeInTheDocument();
  });

  it("keeps refresh contextual to watcher and invokes the history controller", async () => {
    const healthy = renderPanel(state(3));
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    healthy.unmount();

    const inactive = renderPanel(state(3), null, "off");
    const refresh = vi.spyOn(inactive.historyController, "refresh").mockResolvedValue();
    expect(screen.getByText("Automatic updates are off")).toBeInTheDocument();
    const update = screen.getByRole("button", { name: "Refresh" });
    expect(update).toHaveTextContent("Update now");
    await userEvent.click(update);
    expect(refresh).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1" });
  });

  it("explains detached, shallow, and unknown publication states without guessing", () => {
    const detachedPage = page(1, { headState: "detached", branch: null, upstream: null, shallow: true });
    const { versions, ...snapshot } = detachedPage;
    renderPanel(state(1, { snapshot, versions }));
    expect(screen.getByText("This is a partial history")).toBeInTheDocument();
    expect(screen.getByText("Viewing a version outside a version line")).toBeInTheDocument();
  });

  it("virtualizes a thousand versions within the declared DOM budget", () => {
    const { container } = renderPanel(state(1_000));
    const renderedRows = container.querySelectorAll('[role="option"]');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(50);
    expect(container.querySelectorAll("*").length).toBeLessThan(400);
  });

  it("uses the shared progress bar while an older page is loading", () => {
    const historyState = state(40);
    renderPanel(state(40, {
      snapshot: historyState.snapshot ? { ...historyState.snapshot, hasMore: true, nextCursor: "older-page" } : null,
      isLoadingMore: true,
    }));

    expect(screen.getByText("Loading older versions…")).toBeInTheDocument();
    expect(document.querySelector(".history-timeline__loading-more .loading-bar")).toBeInTheDocument();
    expect(document.querySelector(".history-timeline__loading-more .icon--spinning")).not.toBeInTheDocument();
  });

  it("moves timeline selection with the keyboard", async () => {
    const user = userEvent.setup();
    const historyState = state(20);
    const { select } = renderPanel(historyState);
    const timeline = screen.getByRole("listbox", { name: "Saved-version timeline" });
    const selected = await within(timeline).findByRole("option", { selected: true });
    selected.focus();
    await user.keyboard("{ArrowDown}");
    expect(select).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      historyState.versions[1]?.commit,
    );
  });

  it("marks whether timeline selection moved up or down", () => {
    const initial = state(4);
    const { container, historyController, rerender } = renderPanel(initial);
    const panel = (historyState: HistoryState) => (
      <LanguageProvider>
        <HistoryPanel
          controller={historyController}
          query={{ projectId: "/repo", sessionEpoch: "epoch-1" }}
          state={historyState}
          watcherState="watching"
          onOpenSettings={() => {}}
          error={null}
        />
      </LanguageProvider>
    );

    rerender(panel({ ...initial, selectedCommit: initial.versions[2]?.commit ?? null }));
    expect(container.querySelector(".history-row--selected")).toHaveAttribute("data-selection-direction", "down");

    rerender(panel({ ...initial, selectedCommit: initial.versions[1]?.commit ?? null }));
    expect(container.querySelector(".history-row--selected")).toHaveAttribute("data-selection-direction", "up");
  });

  it("marks hover travel from the order the pointer crosses timeline rows", () => {
    renderPanel(state(4));
    const rows = within(screen.getByRole("listbox", { name: "Saved-version timeline" })).getAllByRole("option");

    fireEvent.pointerEnter(rows[2]);
    expect(rows[2]).toHaveAttribute("data-hover-direction", "down");

    fireEvent.pointerEnter(rows[1]);
    expect(rows[1]).toHaveAttribute("data-hover-direction", "up");
  });

  it("keeps the selected version identity visible while its files are loading", () => {
    const historyState = state(2, { detail: { detail: null, isLoading: true, error: null } });
    renderPanel(historyState);
    expect(screen.getAllByText(historyState.versions[0].subject)).toHaveLength(2);
    expect(screen.getAllByText("Reading this saved version…")).toHaveLength(2);
  });

  it("keeps timeline rows compact and moves technical metadata into the selected detail", () => {
    const historyState = state(2);
    const selected = historyState.versions[0];
    const detail: SavedVersionDetail = {
      version: { ...selected, publication: "published", decorations: [{ kind: "tag", name: "v2.0", fullRef: "refs/tags/v2.0" }] },
      comparisonBase: selected.parents[0] ?? "empty",
      comparisonIsEmptyTree: false,
      comparisonIsFirstParent: false,
      files: [{ path: "src/feature.tsx", originalPath: null, category: "changed" }],
      fileCounts: { changed: 1, new: 0, deleted: 0, renamed: 0, total: 1 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    const { container } = renderPanel(state(2, {
      detail: { detail, isLoading: false, error: null },
      selectedFilePath: "src/feature.tsx",
    }));

    const selectedRow = container.querySelector<HTMLButtonElement>(".history-row--selected");
    expect(selectedRow).not.toBeNull();
    if (!selectedRow) throw new Error("selected timeline row was not rendered");
    expect(within(selectedRow).queryByText(selected.shortCommit)).not.toBeInTheDocument();
    expect(within(selectedRow).queryByText("Published")).not.toBeInTheDocument();
    const detailRegion = screen.getByRole("region", { name: selected.subject });
    expect(within(detailRegion).getByText(selected.shortCommit)).toBeInTheDocument();
    expect(within(detailRegion).getByText("Published")).toBeInTheDocument();
    expect(within(detailRegion).getByText("v2.0")).toBeInTheDocument();
    expect(detailRegion.querySelector(".history-file__type img")).toBeInTheDocument();
  });

  it("prefers the tag, then the checked-out line, over every other reference", () => {
    const base = state(5);
    const [tip, released, sibling, remote, plain] = base.versions;
    const { container } = renderPanel({
      ...base,
      versions: [
        {
          ...tip,
          // The shape this repository's own tip has: two local lines and a
          // remote one on a single commit, sorted by name the way Rust sends
          // them, with the checked-out one *not* sorting first.
          decorations: [
            { kind: "head", name: "HEAD", fullRef: "HEAD" },
            { kind: "localBranch", name: "codex/app-shell", fullRef: "refs/heads/codex/app-shell" },
            { kind: "localBranch", name: "main", fullRef: "refs/heads/main" },
            { kind: "remoteBranch", name: "origin/main", fullRef: "refs/remotes/origin/main" },
          ],
        },
        {
          ...released,
          decorations: [
            { kind: "localBranch", name: "release/1.0", fullRef: "refs/heads/release/1.0" },
            { kind: "tag", name: "v1.0.0", fullRef: "refs/tags/v1.0.0" },
          ],
        },
        { ...sibling, decorations: [{ kind: "localBranch", name: "codex/app-shell", fullRef: "refs/heads/codex/app-shell" }] },
        { ...remote, decorations: [{ kind: "remoteBranch", name: "origin/legacy", fullRef: "refs/remotes/origin/legacy" }] },
        { ...plain, decorations: [] },
      ],
    });
    const rows = container.querySelectorAll<HTMLButtonElement>(".history-row");

    // With no tag in play the checked-out line wins the row, even though a
    // sibling line sorts first, and it outranks both the synthetic HEAD
    // marker, which names no line, and the remote ref that repeats it.
    const current = rows[0].querySelector(".history-ref-badge");
    expect(current).toHaveTextContent("main");
    expect(current).toHaveClass("history-ref-badge--current");
    expect(current).toHaveAttribute("title", "Version line main — refs/heads/main");
    expect(rows[0].getAttribute("aria-label")).toContain("Version line main");

    // A tag outranks a line sharing its commit: the line is implied by being
    // there, the tag is the fact you cannot infer. It is never accented.
    const tag = rows[1].querySelector(".history-ref-badge");
    expect(tag).toHaveTextContent("v1.0.0");
    expect(tag).not.toHaveClass("history-ref-badge--current");
    expect(rows[1].getAttribute("aria-label")).toContain("Tag v1.0.0");

    // A line that shares no commit with HEAD is named, never accented.
    expect(rows[2].querySelector(".history-ref-badge")).toHaveTextContent("codex/app-shell");
    expect(rows[2].querySelector(".history-ref-badge")).not.toHaveClass("history-ref-badge--current");
    expect(rows[3].querySelector(".history-ref-badge")).toHaveTextContent("origin/legacy");

    // No ref points here, so the row keeps exactly the metadata it always had.
    expect(rows[4].querySelector(".history-ref-badge")).toBeNull();
    expect(within(rows[4]).getByText("Ada Lovelace")).toBeInTheDocument();

    // Author, reference, time — the order the Overview summary uses too. Both
    // hosts read the same three facts, so neither may drift from the other.
    expect(metaOrder(rows[0], ".history-row__meta")).toEqual([
      "history-row__author", "history-meta-dot", "history-ref-badge", "history-meta-dot", "history-row__date",
    ]);
    expect(metaOrder(rows[4], ".history-row__meta")).toEqual([
      "history-row__author", "history-meta-dot", "history-row__date",
    ]);
  });

  it("searches, filters, and sorts the visible timeline without changing repository history", async () => {
    const user = userEvent.setup();
    const historyState = state(6);
    renderPanel(historyState);

    await user.type(screen.getByPlaceholderText("Search saved versions"), "version 2");
    expect(screen.getByRole("option", { name: "Saved version 2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Saved version 5/ })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search saved versions"));
    await user.click(screen.getByRole("button", { name: "Publication: All" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Published" }));
    expect(within(screen.getByRole("listbox", { name: "Saved-version timeline" })).getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("3 of 6 loaded versions shown")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Order: Newest first" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));
    expect(screen.getByRole("button", { name: "Order: Oldest first" })).toBeInTheDocument();
  });

  it("provides a complete overview and the shared diff-view controls", async () => {
    const user = userEvent.setup();
    const historyState = state(2);
    const selected = historyState.versions[0];
    const detail: SavedVersionDetail = {
      version: selected,
      comparisonBase: selected.parents[0] ?? "empty",
      comparisonIsEmptyTree: false,
      comparisonIsFirstParent: false,
      files: [{ path: "src/feature.tsx", originalPath: null, category: "changed" }],
      fileCounts: { changed: 1, new: 0, deleted: 0, renamed: 0, total: 1 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    const diff = {
      kind: "text" as const,
      path: "src/feature.tsx",
      originalPath: null,
      change: "changed" as const,
      truncated: false,
      hunks: [{
        header: "@@ -1 +1 @@",
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [
          { kind: "deletion" as const, content: "const oldValue = 1;", oldLineNumber: 1, newLineNumber: null },
          { kind: "addition" as const, content: "const newValue = 2;", oldLineNumber: null, newLineNumber: 1 },
        ],
      }],
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container, selectFile } = renderPanel(state(2, {
      detail: { detail, isLoading: false, error: null },
      selectedFilePath: "src/feature.tsx",
      fileDiff: { diff, isLoading: false, error: null },
    }));

    const timelineHeader = container.querySelector(".history-timeline__header");
    const detailHeader = container.querySelector(".history-detail__summary");
    expect(timelineHeader).not.toBeNull();
    expect(detailHeader).not.toBeNull();
    expect(within(timelineHeader as HTMLElement).queryByRole("button", { name: "Refresh" }))
      .not.toBeInTheDocument();
    expect(within(detailHeader as HTMLElement).queryByRole("button", { name: "Refresh" }))
      .not.toBeInTheDocument();
    expect(container.querySelector(".history-detail__summary-top h2")).toHaveTextContent(selected.subject);
    expect(container.querySelector(".history-detail__summary-top h2")).not.toHaveClass("visually-hidden");
    expect(container.querySelector(".history-detail__description")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comparison" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Files changed" })).toBeInTheDocument();
    const overviewFiles = screen.getByRole("listbox", { name: "Files changed in this saved version" });
    const overviewFile = within(overviewFiles).getByRole("option", { name: /src\/feature\.tsx/ });
    expect(within(overviewFile).getByText("feature.tsx")).toBeInTheDocument();
    expect(container.querySelector(".history-overview-subject")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Files changed/ })).not.toBeInTheDocument();
    await user.click(overviewFile);
    expect(selectFile).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      "src/feature.tsx",
    );
    expect(screen.getByRole("tab", { name: "Diff" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Difference view (Unified)" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Split" }));
    expect(container.querySelector(".diff-split-row")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search in diff"), "newValue");
    expect(container.querySelector(".diff-search-match")).toHaveTextContent("newValue");

    const code = container.querySelector<HTMLElement>(".diff-search-match");
    expect(code).not.toBeNull();
    if (!code) throw new Error("Expected the highlighted diff text");
    const content = code.closest(".diff-line__content") ?? code;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.contextMenu(code, { clientX: 200, clientY: 240 });
    await user.click(within(screen.getByRole("menu", { name: "Context actions" })).getByRole("menuitem", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("const newValue = 2;");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("hides the description section when the saved version has no message body", async () => {
    const selected = version(0);
    const detail: SavedVersionDetail = {
      version: selected,
      comparisonBase: "empty",
      comparisonIsEmptyTree: true,
      comparisonIsFirstParent: false,
      files: [],
      fileCounts: { changed: 0, new: 0, deleted: 0, renamed: 0, total: 0 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    renderPanel(state(1, { detail: { detail, isLoading: false, error: null } }));

    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.queryByRole("heading", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comparison" })).toBeInTheDocument();
    expect(screen.getByText("Every file is shown as new because this is the project’s first saved version.")).toBeInTheDocument();
  });

  it("formats locale-aware absolute and relative dates in English and Spanish", () => {
    const timestamp = { unixSeconds: Date.UTC(2026, 7, 21, 10, 30) / 1_000, offsetMinutes: 120 };
    const now = Date.UTC(2026, 7, 22, 10, 30);
    expect(formatHistoryDate(timestamp, "en", now)?.relative).toMatch(/yesterday|1 day ago/i);
    expect(formatHistoryDate(timestamp, "es", now)?.relative).toMatch(/ayer|hace 1 día/i);
    expect(formatHistoryDate(timestamp, "es", now)?.absolute).toMatch(/2026/);
  });
});
