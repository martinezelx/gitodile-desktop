import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createHistoryController } from "./controller";
import type { HistoryPage, HistoryState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { formatHistoryDate, HistoryPanel } from "./HistoryPanel";
import type { HistoryPort } from "./port";

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

function renderPanel(historyState: HistoryState, error: string | null = null) {
  const historyController = controller();
  const select = vi.spyOn(historyController, "selectVersion");
  const utils = render(
    <LanguageProvider>
      <HistoryPanel
        controller={historyController}
        query={{ projectId: "/repo", sessionEpoch: "epoch-1" }}
        state={historyState}
        error={error}
      />
    </LanguageProvider>,
  );
  return { historyController, select, ...utils };
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

  it("moves timeline selection with the keyboard", async () => {
    const user = userEvent.setup();
    const historyState = state(20);
    const { select } = renderPanel(historyState);
    const selected = await screen.findByRole("option", { selected: true });
    selected.focus();
    await user.keyboard("{ArrowDown}");
    expect(select).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      historyState.versions[1]?.commit,
    );
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

  it("searches, filters, and sorts the visible timeline without changing repository history", async () => {
    const user = userEvent.setup();
    const historyState = state(6);
    renderPanel(historyState);

    await user.type(screen.getByPlaceholderText("Search saved versions"), "version 2");
    expect(screen.getByRole("option", { name: "Saved version 2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Saved version 5/ })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search saved versions"));
    await user.click(screen.getByRole("button", { name: "Filter saved versions: All publication states" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Filter saved versions: Published only" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Newest first" }));
    expect(screen.getByRole("button", { name: "Oldest first" })).toBeInTheDocument();
  });

  it("provides real overview, file, diff-view, and diff-search controls", async () => {
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
    const { container } = renderPanel(state(2, {
      detail: { detail, isLoading: false, error: null },
      selectedFilePath: "src/feature.tsx",
      fileDiff: { diff, isLoading: false, error: null },
    }));

    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(container.querySelector(".history-detail__summary-top h2")).toHaveTextContent(selected.subject);
    expect(container.querySelector(".history-detail__summary-top h2")).not.toHaveClass("visually-hidden");
    expect(container.querySelector(".history-detail__description")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByText("Change summary")).toBeInTheDocument();
    expect(screen.getByText("Top files")).toBeInTheDocument();
    expect(container.querySelector(".history-overview-subject")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Files changed/ }));
    expect(screen.getByPlaceholderText("Filter files")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("path");
    expect(screen.getByText("Showing 1 of 1 files")).toBeInTheDocument();
    expect(container.querySelector(".history-file-preview__line--addition")).toHaveTextContent("newValue");
    await user.click(screen.getByRole("tab", { name: "Diff" }));
    await user.click(screen.getByRole("button", { name: "Split" }));
    expect(container.querySelector(".diff-split-row")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search in diff"), "newValue");
    expect(container.querySelector(".diff-search-match")).toHaveTextContent("newValue");
  });

  it("formats locale-aware absolute and relative dates in English and Spanish", () => {
    const timestamp = { unixSeconds: Date.UTC(2026, 7, 21, 10, 30) / 1_000, offsetMinutes: 120 };
    const now = Date.UTC(2026, 7, 22, 10, 30);
    expect(formatHistoryDate(timestamp, "en", now)?.relative).toMatch(/yesterday|1 day ago/i);
    expect(formatHistoryDate(timestamp, "es", now)?.relative).toMatch(/ayer|hace 1 día/i);
    expect(formatHistoryDate(timestamp, "es", now)?.absolute).toMatch(/2026/);
  });
});
