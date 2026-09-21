import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createHistoryController } from "./controller";
import type { HistoryDecoration, HistoryPage, HistoryState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { primaryDecoration } from "./HistoryRefBadge";
import { HistoryPanel, type HistoryLineActions } from "./HistoryPanel";
import { CURRENT_LINE_SCOPE, NO_HISTORY_FILTERS } from "./port";
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
    scope: CURRENT_LINE_SCOPE,
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
    filters: NO_HISTORY_FILTERS,
    scope: CURRENT_LINE_SCOPE,
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
    readImagePreview: vi.fn(async () => { throw new Error("not expected"); }),
  };
  return createHistoryController(port);
}

function renderPanel(
  historyState: HistoryState,
  error: string | null = null,
  watcherState: "starting" | "watching" | "off" | "unavailable" = "watching",
  actions: HistoryLineActions = {},
) {
  const historyController = controller();
  const select = vi.spyOn(historyController, "selectVersion");
  const selectFile = vi.spyOn(historyController, "selectFile");
  const setScope = vi.spyOn(historyController, "setScope");
  const utils = render(
    <LanguageProvider>
      <HistoryPanel
        controller={historyController}
        query={{ projectId: "/repo", sessionEpoch: "epoch-1" }}
        state={historyState}
        watcherState={watcherState}
        actions={actions}
        onOpenSettings={() => {}}
        error={error}
      />
    </LanguageProvider>,
  );
  return { historyController, select, selectFile, setScope, ...utils };
}

/** A version carrying a real local line, which is the only decoration this
 *  screen can also act on. */
function versionOnLine(index: number, name: string): SavedVersionSummary {
  return {
    ...version(index),
    decorations: [{ kind: "localBranch", name, fullRef: `refs/heads/${name}` }],
  };
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

  // The rail between the top of the list and the selected node is the only
  // thing the timeline draws beyond structure and the selection itself, so it
  // has to follow the selection rather than the pointer.
  it("fills the rail down to the selected version and no further", () => {
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

    const rail = (): Array<string | null> =>
      [...container.querySelectorAll<HTMLElement>(".history-row")].map((row) => row.getAttribute("data-rail"));

    rerender(panel({ ...initial, selectedCommit: initial.versions[2]?.commit ?? null }));
    expect(rail()).toEqual(["filled", "filled", "half", null]);

    rerender(panel({ ...initial, selectedCommit: initial.versions[1]?.commit ?? null }));
    expect(rail()).toEqual(["filled", "half", null, null]);

    // Nothing is selected: the rail is structure again, with no stretch of it
    // claimed by anything.
    rerender(panel({ ...initial, selectedCommit: null }));
    expect(rail()).toEqual([null, null, null, null]);
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
    // The row is the subject, the author and the time — no reference badge.
    expect(selectedRow.querySelector(".history-ref-badge")).toBeNull();
    const detailRegion = screen.getByRole("region", { name: selected.subject });
    // The strip is the subject, the author and the reference that points here;
    // the hash and the publication state move behind Details, closed by default.
    expect(within(detailRegion).getByText(selected.author!.name)).toBeInTheDocument();
    expect(detailRegion.querySelector(".history-detail__strip .history-ref-badge")).toHaveTextContent("v2.0");
    expect(within(detailRegion).queryByText(selected.commit)).not.toBeInTheDocument();
    fireEvent.click(within(detailRegion).getByRole("button", { name: "Details" }));
    expect(within(detailRegion).getByText(selected.commit)).toBeInTheDocument();
    expect(within(detailRegion).getByText("Published")).toBeInTheDocument();
    expect(within(detailRegion).queryByText("main")).not.toBeInTheDocument();
    expect(detailRegion.querySelector(".history-file__type img")).toBeInTheDocument();
  });

  it("picks one reference per version: a tag first, the checked-out line over its siblings, a remote last", () => {
    const [tip, released, sibling, remote, plain] = state(5).versions;
    const ref = (kind: HistoryDecoration["kind"], name: string): HistoryDecoration => ({ kind, name, fullRef: `refs/${name}` });

    // No tag in play: the checked-out line wins even though a sibling line sorts
    // first, and it outranks the synthetic HEAD marker and the remote ref that
    // repeats it. The shape this repository's own tip has.
    expect(primaryDecoration({ ...tip, decorations: [
      ref("head", "HEAD"),
      ref("localBranch", "codex/app-shell"),
      ref("localBranch", "main"),
      ref("remoteBranch", "origin/main"),
    ] }, "main")?.name).toBe("main");

    // A tag outranks a line sharing its commit: the line is implied by being
    // there, the tag is the fact you cannot infer.
    expect(primaryDecoration({ ...released, decorations: [
      ref("localBranch", "release/1.0"),
      ref("tag", "v1.0.0"),
    ] }, "main")?.name).toBe("v1.0.0");

    // A line that shares no commit with HEAD is named; a remote is named last;
    // no ref at all is no badge.
    expect(primaryDecoration({ ...sibling, decorations: [ref("localBranch", "codex/app-shell")] }, "main")?.name).toBe("codex/app-shell");
    expect(primaryDecoration({ ...remote, decorations: [ref("remoteBranch", "origin/legacy")] }, "main")?.name).toBe("origin/legacy");
    expect(primaryDecoration({ ...plain, decorations: [] }, "main")).toBeNull();
  });

  it("keeps the timeline row to the author and the time, with no reference badge", () => {
    const base = state(2);
    const { container } = renderPanel({
      ...base,
      versions: [versionOnLine(0, "feature/foo"), version(1)],
    });

    const rows = container.querySelectorAll<HTMLButtonElement>(".history-row");
    expect(rows[0].querySelector(".history-ref-badge")).toBeNull();
    expect(metaOrder(rows[0], ".history-row__meta")).toEqual([
      "history-row__author", "history-meta-dot", "history-row__date",
    ]);
  });

  it("searches and narrows the visible timeline without changing repository history", async () => {
    const user = userEvent.setup();
    const historyState = state(6);
    renderPanel(historyState);

    await user.type(screen.getByPlaceholderText("Search saved versions"), "version 2");
    expect(screen.getByRole("option", { name: "Saved version 2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Saved version 5/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByPlaceholderText("Search saved versions")).toHaveValue("");

  });

  // The trigger counts what is on and the chips name it. They read one
  // description of the filter set for exactly this reason: a badge saying
  // three beside two chips is worse than either signal on its own.
  it("counts on the trigger exactly what the chips name", () => {
    const every = {
      author: "Ada",
      since: "2026-01-01",
      until: "2026-06-30",
      path: "src/app",
      noMerges: true,
      unpublishedOnly: true,
    };
    const { container } = renderPanel(state(4, { filters: every }));

    const chips = container.querySelectorAll(".filter-chip");
    expect(chips).toHaveLength(6);
    expect(container.querySelector(".filter-control__badge")).toHaveTextContent(String(chips.length));
    expect(screen.getByRole("button", { name: "Filters (6 on)" })).toBeInTheDocument();
  });

  // Both halves of the screen-level empty state, which is about the repository
  // and nothing else. It swallowed the whole screen twice: once the moment a
  // filter was applied, and once on Clear all — where the filters are already
  // off and the empty list on screen is still the retired question's answer.
  it("never mistakes an empty filtered list for an empty repository", () => {
    const emptied = state(2, { versions: [] });

    const filtering = renderPanel({ ...emptied, filters: { ...NO_HISTORY_FILTERS, unpublishedOnly: true } });
    expect(screen.queryByText("No saved versions yet")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Saved-version timeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
    filtering.unmount();

    // Clear all: the filters are off, the rows are still the old answer, and a
    // read is in flight. Nothing here is a statement about the repository.
    const clearing = renderPanel({ ...emptied, isLoading: true });
    expect(screen.queryByText("No saved versions yet")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Saved-version timeline" })).toBeInTheDocument();
    clearing.unmount();

    // Settled, unfiltered and genuinely empty: now it is a statement.
    renderPanel(emptied);
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Saved-version timeline" })).not.toBeInTheDocument();
  });

  // The filters are answered by Git over the whole history, so the panel's job
  // is to hand the controller a filter set — not to hide rows itself.
  it("sends every chosen filter to the controller rather than hiding loaded rows", async () => {
    const user = userEvent.setup();
    const { historyController } = renderPanel(state(6));
    const setFilters = vi.spyOn(historyController, "setFilters").mockResolvedValue(undefined);

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("checkbox", { name: "Hide branch merges" }));
    expect(setFilters).toHaveBeenLastCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      expect.objectContaining({ noMerges: true }),
    );

    await user.click(screen.getByRole("radio", { name: "7 days" }));
    expect(setFilters.mock.calls.at(-1)?.[1].since).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await user.type(screen.getByLabelText("Author"), "Ada{Enter}");
    expect(setFilters).toHaveBeenLastCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      expect.objectContaining({ author: "Ada" }),
    );

    // Every row stays on screen: nothing here narrows the list on the client.
    expect(within(screen.getByRole("listbox", { name: "Saved-version timeline" })).getAllByRole("option"))
      .toHaveLength(6);
  });

  // Publication is a comparison against an upstream. Without one every version
  // reads `unknown`, so the switch could only ever empty the list — it is not
  // offered rather than offered and useless.
  it("offers the unpublished filter only where publication can be determined", async () => {
    const user = userEvent.setup();
    const withUpstream = state(4);
    const first = renderPanel(withUpstream);
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("checkbox", { name: "Not published yet" })).toBeInTheDocument();
    first.unmount();

    renderPanel({ ...withUpstream, snapshot: { ...withUpstream.snapshot!, upstream: null } });
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("checkbox", { name: "Not published yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hide branch merges" })).toBeInTheDocument();
  });

  // The same two arrow pairs the Changes diff header carries. They replaced a
  // footer of labelled buttons that could only step changes, never files.
  it("steps between changed files and between changes with the shared diff controls", async () => {
    const user = userEvent.setup();
    const historyState = state(2);
    const selected = historyState.versions[0];
    const detail: SavedVersionDetail = {
      version: selected,
      comparisonBase: selected.parents[0] ?? "empty",
      comparisonIsEmptyTree: false,
      comparisonIsFirstParent: false,
      files: [
        { path: "src/first.tsx", originalPath: null, category: "changed" },
        { path: "src/second.tsx", originalPath: null, category: "new" },
      ],
      fileCounts: { changed: 1, new: 1, deleted: 0, renamed: 0, total: 2 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    const hunk = (start: number) => ({
      header: `@@ -${start} +${start} @@`,
      oldStart: start,
      oldLines: 1,
      newStart: start,
      newLines: 1,
      lines: [{ kind: "addition" as const, content: `line ${start}`, oldLineNumber: null, newLineNumber: start }],
    });
    const { selectFile } = renderPanel(state(2, {
      detail: { detail, isLoading: false, error: null },
      selectedFilePath: "src/first.tsx",
      fileDiff: {
        diff: { kind: "text", path: "src/first.tsx", originalPath: null, change: "changed", truncated: false, hunks: [hunk(1), hunk(9)] },
        isLoading: false,
        error: null,
      },
    }));

    // The open file is the first of two, so only one direction is available.
    expect(screen.getByRole("button", { name: "Previous file" })).toBeDisabled();
    const nextFile = screen.getByRole("button", { name: "Next file" });
    expect(nextFile).toBeEnabled();
    await user.click(nextFile);
    expect(selectFile).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      "src/second.tsx",
    );

    // The position is spoken, not printed: the file list beside it already
    // says where the open file sits.
    expect(screen.getByText("File 1 of 2")).toHaveClass("visually-hidden");
    expect(screen.getByText("Change 1 of 2")).toHaveClass("visually-hidden");

    expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByRole("button", { name: "Next change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous change" })).toBeEnabled();

    // The footer those buttons used to live in is gone with them.
    expect(document.querySelector(".history-diff-pane__footer")).toBeNull();
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
    const { container } = renderPanel(state(2, {
      detail: { detail, isLoading: false, error: null },
      selectedFilePath: "src/feature.tsx",
      fileDiff: { diff, isLoading: false, error: null },
    }));

    const timelineHeader = container.querySelector(".history-timeline__header");
    const strip = container.querySelector(".history-detail__strip");
    // The panels start at the top of the workspace: the title is the timeline
    // panel's own header and the version strip heads the card, so no page row
    // sits above either.
    expect(container.querySelector(".screen-header")).toBeNull();
    expect(timelineHeader).not.toBeNull();
    expect(strip).not.toBeNull();
    expect(container.querySelector(".history-details")).toBeNull();
    const diffToolbar = container.querySelector(".history-diff-toolbar");
    // The open file's line totals are gone from the toolbar: the diff itself
    // states what changed, and the row is for identity and reading controls.
    expect(diffToolbar?.querySelector(".history-lines-added")).toBeNull();
    expect(diffToolbar?.querySelector(".history-lines-removed")).toBeNull();
    expect(diffToolbar?.querySelector(".history-diff-toolbar__controls")).not.toBeNull();
    expect(within(timelineHeader as HTMLElement).queryByRole("button", { name: "Refresh" }))
      .not.toBeInTheDocument();
    expect(within(strip as HTMLElement).queryByRole("button", { name: "Refresh" }))
      .not.toBeInTheDocument();
    expect(container.querySelector(".history-detail__strip-title")).toHaveTextContent(selected.subject);

    // The story is closed by default; opening it shows the message and the
    // facts the strip cannot carry.
    expect(screen.queryByRole("heading", { name: "Commit details" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("heading", { name: "Message" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Commit details" })).toBeInTheDocument();
    expect(screen.getByText("1 changed file")).toBeInTheDocument();
    expect(screen.getByText("Changes are compared with the saved version immediately before this one.")).toBeInTheDocument();

    // The shared reading controls live in the diff strip; the find is an icon
    // until it is asked for, so the open file's own name keeps the width.
    await user.click(screen.getByRole("button", { name: "Difference view (Unified)" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Split" }));
    expect(container.querySelector(".diff-split-row")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search in the selected file difference" }));
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

  it("says when the saved version has no message body", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("Untitled saved version")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.getByText("Every file is shown as new because this is the project’s first saved version.")).toBeInTheDocument();
  });

  it("formats locale-aware absolute and relative dates in English and Spanish", () => {
    const timestamp = { unixSeconds: Date.UTC(2026, 7, 21, 10, 30) / 1_000, offsetMinutes: 120 };
    const now = Date.UTC(2026, 7, 22, 10, 30);
    expect(formatHistoryDate(timestamp, { language: "en", dateFormat: "system", numberFormat: "system" }, now)?.relative).toMatch(/yesterday|1 day ago/i);
    expect(formatHistoryDate(timestamp, { language: "es", dateFormat: "system", numberFormat: "system" }, now)?.relative).toMatch(/ayer|hace 1 día/i);
    expect(formatHistoryDate(timestamp, { language: "es", dateFormat: "system", numberFormat: "system" }, now)?.absolute).toMatch(/2026/);
  });

  it("reads a named version line from the strip's filter panel, and says which one in a chip", async () => {
    const user = userEvent.setup();
    const { setScope } = renderPanel(state(3), null, "watching", { lines: ["main", "feature/foo"] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Specific version line" }));
    await user.click(screen.getByRole("option", { name: "feature/foo" }));

    expect(setScope).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      { kind: "line", name: "feature/foo" },
    );

    // The chip states which history is being read, and is not a filter chip:
    // clearing the filters must not silently change the line.
    cleanup();
    renderPanel(state(3, { scope: { kind: "line", name: "feature/foo" } }));
    expect(screen.getByRole("button", { name: "Show the current line again" })).toHaveTextContent("feature/foo");
  });

  it("offers the project's own version lines, so an unknown name cannot be asked for", async () => {
    const user = userEvent.setup();
    // The inventory the status bar already holds, listed rather than typed:
    // there is no longer a way to name a line this project does not have.
    renderPanel(state(3), null, "watching", { lines: ["main", "feature/foo", "release/1.0"] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Specific version line" }));

    const options = within(screen.getByRole("listbox", { name: "Specific version line" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["main", "feature/foo", "release/1.0"]);
  });

  it("filters a long list of lines and closes on Escape without closing the filters", async () => {
    const user = userEvent.setup();
    const lines = Array.from({ length: 12 }, (_, index) => `feature/${index}`);
    renderPanel(state(3), null, "watching", { lines });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const trigger = screen.getByRole("button", { name: "Specific version line" });
    await user.click(trigger);

    await user.type(screen.getByRole("searchbox", { name: "Search version lines…" }), "feature/1");
    const options = within(screen.getByRole("listbox", { name: "Specific version line" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["feature/1", "feature/10", "feature/11"]);

    // Escape belongs to the innermost thing that is open.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Specific version line" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes a list inside the panel when the press lands elsewhere in it", async () => {
    const user = userEvent.setup();
    renderPanel(state(3), null, "watching", { lines: ["main", "feature/foo"] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Specific version line" }));
    expect(screen.getByRole("listbox", { name: "Specific version line" })).toBeInTheDocument();

    // The panel's own dismissal only covers presses outside the panel, so
    // without this the list stayed open under whatever was reached for next —
    // and two of them could be open at once, overlapping.
    await user.click(screen.getByRole("radio", { name: "Any" }));
    expect(screen.queryByRole("listbox", { name: "Specific version line" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("names both ends of an explicit range rather than a preset it outgrew", () => {
    // A preset is shorthand for a `since` with no `until`. Once the other end
    // is set, "7 days" beside "To 5 Mar" describes a filter nobody asked for.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const day = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
    renderPanel(state(3, { filters: { ...NO_HISTORY_FILTERS, since: day, until: "2026-03-05" } }));

    expect(screen.queryByText("7 days")).toBeNull();
    expect(screen.getByText(/^From /)).toBeInTheDocument();
    expect(screen.getByText(/^To /)).toBeInTheDocument();
    // Two chips, and a count that agrees with them.
    expect(screen.getByRole("button", { name: "Filters (2 on)" })).toBeInTheDocument();
  });

  it("offers every local line at once, and a way back to the current one", async () => {
    const user = userEvent.setup();
    const { setScope } = renderPanel(state(3), null, "watching", { lines: ["main"] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("radio", { name: "All lines" }));
    expect(setScope).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      { kind: "allLines" },
    );

    cleanup();
    const scoped = renderPanel(state(3, { scope: { kind: "allLines" } }));
    await user.click(screen.getByRole("button", { name: "Show the current line again" }));
    expect(scoped.setScope).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      { kind: "currentLine" },
    );
  });

  it("keeps the scope when the filters are cleared", async () => {
    const user = userEvent.setup();
    const scoped = state(3, {
      scope: { kind: "line", name: "feature/foo" },
      filters: { ...NO_HISTORY_FILTERS, noMerges: true },
    });
    const { setScope } = renderPanel(scoped);

    await user.click(screen.getByRole("button", { name: "Filters (1 on)" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(setScope).not.toHaveBeenCalled();
    // The chip in the header survives a "clear all" the filter panel does not
    // touch, which is the whole point: scope is not a filter.
    expect(document.querySelector(".history-scope-chip")).toHaveTextContent("feature/foo");
  });

  it("offers a local line's own actions from the row that names it", async () => {
    const user = userEvent.setup();
    const onViewLine = vi.fn();
    const onSwitchLine = vi.fn();
    const onCreateLineFromVersion = vi.fn();
    const rows = state(1);
    const scoped: HistoryState = {
      ...rows,
      versions: [versionOnLine(0, "feature/foo")],
      selectedCommit: versionOnLine(0, "feature/foo").commit,
    };
    renderPanel(scoped, null, "watching", { onViewLine, onSwitchLine, onCreateLineFromVersion });

    fireEvent.contextMenu(screen.getAllByRole("option")[0]);
    await user.click(screen.getByRole("button", { name: "View “feature/foo” in Lines" }));
    expect(onViewLine).toHaveBeenCalledWith("feature/foo");

    fireEvent.contextMenu(screen.getAllByRole("option")[0]);
    await user.click(screen.getByRole("button", { name: "Switch this project to “feature/foo”" }));
    expect(onSwitchLine).toHaveBeenCalledWith("feature/foo");

    fireEvent.contextMenu(screen.getAllByRole("option")[0]);
    await user.click(screen.getByRole("button", { name: "Create a new version line from this version" }));
    expect(onCreateLineFromVersion).toHaveBeenCalledWith(
      expect.objectContaining({ commit: versionOnLine(0, "feature/foo").commit }),
    );
  });

  it("does not offer to switch to the line the project is already on", async () => {
    const rows = state(1);
    const scoped: HistoryState = {
      ...rows,
      versions: [versionOnLine(0, "main")],
      selectedCommit: versionOnLine(0, "main").commit,
    };
    renderPanel(scoped, null, "watching", { onViewLine: vi.fn(), onSwitchLine: vi.fn() });

    fireEvent.contextMenu(screen.getAllByRole("option")[0]);
    expect(screen.getByRole("button", { name: "View “main” in Lines" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch this project/ })).not.toBeInTheDocument();
  });

  it("offers no line actions on a row that names only a tag", async () => {
    // A tag is a fact about a version, not a line this project can view or
    // switch to, so it never becomes a control.
    renderPanel(state(1), null, "watching", { onViewLine: vi.fn(), onSwitchLine: vi.fn() });

    fireEvent.contextMenu(screen.getAllByRole("option")[0]);
    expect(screen.queryByRole("button", { name: /in Lines/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch this project/ })).not.toBeInTheDocument();
  });

  it("states the scope in the timeline header, and only when it is not the current line", () => {
    // The status bar already says which line is being worked on. Repeating it
    // would be noise; saying nothing when the two differ would be worse.
    const current = renderPanel(state(3));
    expect(current.container.querySelector(".history-scope-chip")).toBeNull();
    cleanup();

    const all = renderPanel(state(3, { scope: { kind: "allLines" } }));
    expect(all.container.querySelector(".history-scope-chip")).toHaveTextContent("All lines");
    cleanup();

    const named = renderPanel(state(3, { scope: { kind: "line", name: "main" } }));
    const chip = named.container.querySelector(".history-scope-chip");
    expect(chip).toHaveTextContent("main");
    // Removable where it is stated: the chip itself is the way back, so the
    // scope is cleared from the header rather than from the filter panel.
    expect(chip).toHaveAttribute("aria-label", "Show the current line again");
  });

  it("shows a chosen line as a chosen line, and lets it be undone from the field itself", async () => {
    const user = userEvent.setup();
    const { setScope, container } = renderPanel(
      state(3, { scope: { kind: "line", name: "feature/foo" } }),
      null,
      "watching",
      { lines: ["main", "feature/foo"] },
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    // A picker waiting to be opened and one holding the line being read are not
    // the same thing, and the state does not rest on colour alone: the name is
    // in the trigger, and its own way out is beside it.
    expect(screen.getByRole("button", { name: "Specific version line" })).toHaveTextContent("feature/foo");
    expect(container.querySelector(".history-filter__field--selected")).not.toBeNull();

    const panel = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(panel).getByRole("button", { name: "Show the current line again" }));
    expect(setScope).toHaveBeenCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      { kind: "currentLine" },
    );
  });

  it("offers no clear control while no line is chosen", async () => {
    const user = userEvent.setup();
    renderPanel(state(3), null, "watching", { lines: ["main"] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    expect(screen.getByRole("button", { name: "Specific version line" })).toHaveTextContent("Choose a specific line…");
    expect(within(panel).queryByRole("button", { name: "Show the current line again" })).toBeNull();
  });

  it("keeps the version's own actions reachable, and says when they are open", async () => {
    const user = userEvent.setup();
    const onCreateLineFromVersion = vi.fn();
    const detail: SavedVersionDetail = {
      version: version(0),
      comparisonBase: "empty-tree",
      comparisonIsEmptyTree: true,
      comparisonIsFirstParent: false,
      files: [],
      fileCounts: { changed: 0, new: 0, deleted: 0, renamed: 0, total: 0 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    renderPanel(
      state(1, { detail: { detail, isLoading: false, error: null } }),
      null,
      "watching",
      { onCreateLineFromVersion },
    );

    const trigger = screen.getByRole("button", { name: "What this saved version can do" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Create a new version line from this version" }));
    expect(onCreateLineFromVersion).toHaveBeenCalledOnce();
    // Focus goes back to the control that opened the menu, not to the document.
    expect(trigger).toHaveFocus();
  });

  it("opens the version's line actions from More and leaves a tag a fact", async () => {
    const user = userEvent.setup();
    const onViewLine = vi.fn();
    const withRefs: SavedVersionSummary = {
      ...version(0),
      decorations: [
        { kind: "head", name: "HEAD", fullRef: "HEAD" },
        { kind: "localBranch", name: "main", fullRef: "refs/heads/main" },
        { kind: "tag", name: "v1.0", fullRef: "refs/tags/v1.0" },
      ],
    };
    const detail: SavedVersionDetail = {
      version: withRefs,
      comparisonBase: "empty-tree",
      comparisonIsEmptyTree: true,
      comparisonIsFirstParent: false,
      files: [],
      fileCounts: { changed: 0, new: 0, deleted: 0, renamed: 0, total: 0 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    renderPanel(
      state(1, { detail: { detail, isLoading: false, error: null } }),
      null,
      "watching",
      { onViewLine },
    );

    // A tag and HEAD are facts about this version; neither is a line this
    // project can view or switch to, so neither becomes a control.
    expect(screen.queryByRole("button", { name: /v1\.0/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /HEAD/ })).toBeNull();

    const more = screen.getByRole("button", { name: "What this saved version can do" });
    await user.click(more);
    await user.click(screen.getByRole("button", { name: "View “main” in Lines" }));
    expect(onViewLine).toHaveBeenCalledWith("main");
    expect(more).toHaveFocus();
  });

  it("asks Git for a date range the presets cannot express", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 2, 10));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onFilters = vi.fn();
    const { historyController } = renderPanel(state(3));
    const setFilters = vi.spyOn(historyController, "setFilters").mockImplementation(async (_query, filters) => {
      onFilters(filters);
    });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    // The two ends are the fifth state of the same control, so they are opened
    // rather than always standing there.
    expect(screen.queryByRole("button", { name: /^From/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Range" }));
    // Opening them narrows nothing on its own.
    expect(setFilters).not.toHaveBeenCalled();

    // `until` has been validated in Rust since the filters were built; only the
    // interface had never offered it, so "that week in March" could not be
    // asked for.
    await user.click(screen.getByRole("button", { name: "From" }));
    const calendar = screen.getByRole("dialog", { name: "Choose the first day" });
    // By position in the month rather than by name: the day's accessible name
    // is the date written the reader's way, which is the point of the control
    // and a poor handle for a test.
    const second = within(calendar)
      .getAllByRole("button")
      .find((day) => day.textContent === "2" && !day.className.includes("outside"));
    await user.click(second!);

    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(onFilters).toHaveBeenLastCalledWith(expect.objectContaining({ since: "2026-03-02" }));
    vi.useRealTimers();
  });

  it("keeps a preset and a range from claiming each other's state", async () => {
    const user = userEvent.setup();
    const ranged = state(3, {
      filters: { ...NO_HISTORY_FILTERS, since: "2026-03-02", until: "2026-03-08" },
    });
    const { historyController } = renderPanel(ranged);
    const setFilters = vi.spyOn(historyController, "setFilters");

    await user.click(screen.getByRole("button", { name: "Filters (2 on)" }));
    // A range restored from state opens its own control: "Custom" is the
    // answer, "Any" is not, and choosing a preset ends the range rather than
    // leaving half of it behind.
    expect(screen.getByRole("radio", { name: "Range" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Any" })).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "7 days" }));
    expect(setFilters).toHaveBeenLastCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      expect.objectContaining({ until: null }),
    );
  });

  it("offers the authors it has loaded as a shortcut, and says that is what they are", async () => {
    const user = userEvent.setup();
    const { historyController } = renderPanel(state(3));
    const setFilters = vi.spyOn(historyController, "setFilters");

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Authors of the versions loaded" }));

    await user.click(screen.getByRole("option", { name: "Ada Lovelace" }));
    expect(setFilters).toHaveBeenLastCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      expect.objectContaining({ author: "Ada Lovelace" }),
    );

    // The box stays the filter — Git matches it over every version — so the
    // list has to say it is only what this screen happens to hold.
    await user.click(screen.getByRole("button", { name: "Authors of the versions loaded" }));
    expect(screen.getByText("Only the versions loaded")).toBeInTheDocument();
  });

  it("offers the open version's folders and files, and forgives how a path is written", async () => {
    const user = userEvent.setup();
    const detail: SavedVersionDetail = {
      version: version(0),
      comparisonBase: "empty-tree",
      comparisonIsEmptyTree: true,
      comparisonIsFirstParent: false,
      files: [
        { path: "src/app/main.ts", originalPath: null, category: "changed" },
        { path: "docs/guide.md", originalPath: null, category: "new" },
      ],
      fileCounts: { changed: 1, new: 1, deleted: 0, renamed: 0, total: 2 },
      filesTruncated: false,
      countsAreMinimum: false,
    };
    const { historyController } = renderPanel(state(1, { detail: { detail, isLoading: false, error: null } }));
    const setFilters = vi.spyOn(historyController, "setFilters");

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Folders and files of the open version" }));
    const options = within(
      screen.getByRole("listbox", { name: "Folders and files of the open version" }),
    ).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "docs",
      "src",
      "src/app",
      "src/app/main.ts",
      "docs/guide.md",
    ]);

    await user.click(screen.getByRole("option", { name: "src/app" }));
    expect(setFilters).toHaveBeenLastCalledWith(
      { projectId: "/repo", sessionEpoch: "epoch-1" },
      expect.objectContaining({ path: "src/app" }),
    );
  });

  it("accepts the four ways a folder gets written", async () => {
    const user = userEvent.setup();
    const { historyController } = renderPanel(state(3));
    const setFilters = vi.spyOn(historyController, "setFilters");

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const field = screen.getByLabelText("File or folder");

    // Each of these used to fail the whole read as an invalid path, for a
    // folder that is perfectly valid.
    for (const written of ["/src/app", "src/app/", "./src/app", "src\\app"]) {
      await user.clear(field);
      await user.type(field, `${written}{Enter}`);
      expect(setFilters).toHaveBeenLastCalledWith(
        { projectId: "/repo", sessionEpoch: "epoch-1" },
        expect.objectContaining({ path: "src/app" }),
      );
    }
  });
});
