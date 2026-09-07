import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { VersionLinesPanel } from "./VersionLinesPanel";
import type { VersionLineHistory, VersionLinesSnapshot } from "./domain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function snapshot(overrides: Partial<VersionLinesSnapshot> = {}): VersionLinesSnapshot {
  return {
    branch: "main",
    headState: "branch",
    currentCommit: "abc123",
    lines: [
      {
        name: "main",
        tip: { commit: "abc123", shortCommit: "abc123a", subject: "first version", committedAt: "2026-07-01T00:00:00Z" },
        isActive: true,
        upstream: null,
        isRetainedElsewhere: false,
        uniqueCommitCount: null,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
      {
        name: "feature/new-thing",
        tip: { commit: "def456", shortCommit: "def456a", subject: "in progress", committedAt: "2026-07-02T00:00:00Z" },
        isActive: false,
        upstream: null,
        isRetainedElsewhere: true,
        uniqueCommitCount: 2,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
    ],
    totalCount: 2,
    isTruncated: false,
    unreadableCount: 0,
    ...overrides,
  };
}

/** The default snapshot plus a third line under a different name prefix, so
 * the search box and the prefix checkboxes have something to discriminate. */
function withBugfixLine(): VersionLinesSnapshot {
  return snapshot({
    lines: [
      snapshot().lines[0],
      snapshot().lines[1],
      {
        name: "bugfix/other",
        tip: { commit: "ghi789", shortCommit: "ghi789a", subject: "fix", committedAt: "2026-07-03T00:00:00Z" },
        isActive: false,
        upstream: null,
        isRetainedElsewhere: true,
        uniqueCommitCount: 0,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
    ],
    totalCount: 3,
  });
}

/** The panel is controlled: the branch inventory, its loading flag, and its
 * error live in the project session so leaving the screen and coming back
 * renders the known answer instead of a spinner (task 019). These defaults
 * stand in for `app/App.tsx` holding a loaded snapshot. */
function renderPanel(props: Partial<React.ComponentProps<typeof VersionLinesPanel>> = {}) {
  const onChanged = vi.fn();
  const onSaveVersion = vi.fn();
  const onRefresh = vi.fn();
  const onSnapshot = vi.fn();
  const utils = render(
    <LanguageProvider>
      <VersionLinesPanel
        projectPath="/repo"
        sessionEpoch="epoch-1"
        snapshot={snapshot()}
        error={null}
        isLoading={false}
        watcherState="watching"
        onOpenSettings={vi.fn()}
        onRefresh={onRefresh}
        onSnapshot={onSnapshot}
        onChanged={onChanged}
        onSaveVersion={onSaveVersion}
        {...props}
        onOperationStart={props.onOperationStart ?? (() => true)}
        onOperationFinish={props.onOperationFinish ?? vi.fn()}
        onOperationPhaseChange={props.onOperationPhaseChange ?? vi.fn()}
      />
    </LanguageProvider>,
  );
  return { onChanged, onSaveVersion, onRefresh, onSnapshot, ...utils };
}

/** What the on-demand per-line read answers. Only the selected line's history
 * is ever asked for, so a stub keyed by name is all the panel can observe. */
function history(name: string, overrides: Partial<VersionLineHistory> = {}): VersionLineHistory {
  return {
    name,
    totalCount: 12,
    hasMore: true,
    versions: [
      {
        commit: "def456",
        shortCommit: "def456a",
        subject: "in progress",
        authorName: "Ada Lovelace",
        committedAt: "2026-07-02T00:00:00Z",
      },
      {
        commit: "ccc333",
        shortCommit: "ccc333a",
        subject: "an earlier step",
        authorName: "Ada Lovelace",
        committedAt: "2026-07-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

/** The list column's rows, in the order they are shown. */
const listedNames = (): (string | null)[] =>
  screen.getAllByRole("option").map((row) => row.querySelector(".version-line-row__name")?.textContent ?? null);

/** The detail column for the line currently selected. */
const detailPanel = (name: string): HTMLElement => screen.getByRole("region", { name: `Details for “${name}”` });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VersionLinesPanel", () => {
  it("keeps manual refresh and Settings available when automatic updates are off", async () => {
    const onOpenSettings = vi.fn();
    const { onRefresh } = renderPanel({ watcherState: "off", onOpenSettings, isLoading: false });

    const notice = screen.getByText("This screen may be out of date.").closest(".automatic-updates-notice");
    expect(notice).not.toBeNull();
    await userEvent.click(within(notice as HTMLElement).getByRole("button", { name: "Update version lines" }));
    expect(onRefresh).toHaveBeenCalledOnce();

    await userEvent.click(within(notice as HTMLElement).getByRole("button", { name: "Turn on automatic updates" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("keeps the automatic-updates notice mounted while version lines refresh", () => {
    renderPanel({ watcherState: "unavailable", isLoading: true });

    expect(screen.getByText("Automatic updates aren’t available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading version lines…" })).toBeDisabled();
  });

  it("opens on the master-detail pair, with the active line listed first and selected", async () => {
    renderPanel();

    // The list column: every line as one row, the active one at the head.
    expect(listedNames()).toEqual(["main", "feature/new-thing"]);
    const activeRow = screen.getByRole("option", { name: "main — Active" });
    expect(activeRow).toHaveAttribute("aria-selected", "true");

    // The detail column describes it without anything being clicked.
    const detail = detailPanel("main");
    expect(within(detail).getByRole("heading", { level: 2 })).toHaveTextContent("main");
    expect(within(detail).getByText("Latest saved version")).toBeInTheDocument();
    expect(within(detail).getByText("first version")).toBeInTheDocument();

    // Reading is the caller's job, so the screen never spawns Git work just by
    // being shown.
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("moves the detail column to whichever line is selected", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));

    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByText("in progress")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "feature/new-thing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "main — Active" })).toHaveAttribute("aria-selected", "false");
    // Switch belongs to the chosen line, and only to a line that is not the
    // active one.
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeEnabled();
    expect(within(detail).queryByRole("button", { name: "New version from this line" })).not.toBeInTheDocument();
  });

  it("walks the list with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPanel();

    screen.getByRole("option", { name: "main — Active" }).focus();
    await user.keyboard("{ArrowDown}");

    await waitFor(() => expect(screen.getByRole("option", { name: "feature/new-thing" })).toHaveFocus());
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();
  });

  it("shows the cached list, not a spinner, while a refresh runs behind it", () => {
    renderPanel({ isLoading: true });

    // The list is the previous answer and the strip says it is being replaced,
    // rather than the whole screen collapsing into a loading state.
    expect(listedNames()).toContain("feature/new-thing");
    expect(document.querySelector(".version-lines-list-panel__progress")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Lines" })).toBeInTheDocument();
  });

  it("loads with a spinner only when the project has no cached snapshot", () => {
    renderPanel({ snapshot: null, isLoading: true });

    expect(screen.getAllByText("Loading version lines…").length).toBeGreaterThan(0);
  });

  it("keeps a stale list visible and offers a contextual retry when a refresh fails", async () => {
    const { onRefresh } = renderPanel({ error: "Git couldn't read the version lines." });

    expect(listedNames()).toContain("feature/new-thing");
    expect(
      screen.getByText("This is the last result we could read. The latest check didn’t work."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("filters the list by search text without hiding the active line", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await user.type(screen.getByPlaceholderText("Search version lines…"), "bugfix");

    // The active line is where the project *is*: a search that hides it leaves
    // the reader without the row that answers "where am I".
    expect(listedNames()).toEqual(["main", "bugfix/other"]);
  });

  it("filters by a name prefix derived from the actual branch names", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /^bugfix/ }));

    expect(listedNames()).toEqual(["main", "bugfix/other"]);
    // The trigger reports how much narrowing is in effect, so a filtered list
    // is never a mystery.
    expect(screen.getByRole("button", { name: "Filter and sort (1 filter on)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(listedNames()).toContain("feature/new-thing");
  });

  it("combines a state filter with a prefix filter instead of replacing it", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /^bugfix/ }));
    await user.click(screen.getByRole("checkbox", { name: /Local only/ }));

    // Both lines are local-only, so the prefix is what still narrows the list:
    // the two groups AND together rather than one overriding the other.
    expect(listedNames()).toEqual(["main", "bugfix/other"]);
    expect(screen.getByRole("button", { name: "Filter and sort (2 filters on)" })).toBeInTheDocument();
  });

  it("offers a remote-tracking state filter beside the local-only one", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          snapshot().lines[1],
          {
            name: "release/1.0",
            tip: { commit: "rel111", shortCommit: "rel111a", subject: "cut", committedAt: "2026-07-05T00:00:00Z" },
            isActive: false,
            upstream: "origin/release/1.0",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /Tracking a remote/ }));

    expect(listedNames()).toEqual(["main", "release/1.0"]);
  });

  it("sorts the list from the same control as the filters", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          {
            name: "zeta/newest",
            tip: { commit: "zzz111", shortCommit: "zzz111a", subject: "newest", committedAt: "2026-07-20T00:00:00Z" },
            isActive: false,
            upstream: "origin/zeta/newest",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 2,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "alpha/oldest",
            tip: { commit: "aaa111", shortCommit: "aaa111a", subject: "oldest", committedAt: "2026-07-01T00:00:00Z" },
            isActive: false,
            upstream: null,
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: null,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    expect(listedNames()).toEqual(["main", "zeta/newest", "alpha/oldest"]);

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("radio", { name: "Name (A–Z)" }));
    expect(listedNames()).toEqual(["main", "alpha/oldest", "zeta/newest"]);

    // "Local-only first" is deliberately narrower than "not pushed": the
    // tracked zeta line is ahead, but the no-upstream alpha line comes first.
    await user.click(screen.getByRole("radio", { name: "Local-only first" }));
    expect(listedNames()).toEqual(["main", "alpha/oldest", "zeta/newest"]);
  });

  it("closes the filter panel on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    const trigger = screen.getByRole("button", { name: "Filter and sort" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Filter and sort" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filter and sort" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows a recovery banner on detached HEAD", async () => {
    renderPanel({
      snapshot: snapshot({ branch: null, headState: "detached", lines: [snapshot().lines[1]], totalCount: 1 }),
    });

    expect(await screen.findByText("This project isn't on a version line right now")).toBeInTheDocument();
    expect(screen.getByText("Create a version line here")).toBeInTheDocument();
  });

  it("disables Switch and Delete for a line checked out in another worktree", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        lines: [snapshot().lines[0], { ...snapshot().lines[1], worktreePath: "/other/workspace" }],
      }),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByText(/Open in another workspace at \/other\/workspace/)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeDisabled();
    expect(
      within(detail).getByRole("button", { name: /“feature\/new-thing” is open in another workspace/ }),
    ).toBeDisabled();
    // Renaming a line another workspace has checked out would rewrite the ref
    // under that window, so it isn't offered at all.
    expect(within(detail).queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
  });

  it("surfaces a retry action when discovery fails with nothing cached", async () => {
    const { onRefresh } = renderPanel({
      snapshot: null,
      error: "GitOdile couldn't load this project's version lines.",
    });

    await userEvent.click(await screen.findByText("Try again"));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("opens the create dialog from the header button and creates a line", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const onOperationFinish = vi.fn();
    const onOperationPhaseChange = vi.fn();
    const { onChanged, onSnapshot } = renderPanel({
      onOperationStart,
      onOperationFinish,
      onOperationPhaseChange,
    });

    await user.click(screen.getByRole("button", { name: "New line" }));
    expect(onOperationStart).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText("Name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Create without switching",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "create-token",
      name: "feature/z",
      headState: "branch",
      startingCommit: "abc123",
      willSwitch: false,
      hasUnsavedWork: false,
    });
    mockedInvoke.mockResolvedValueOnce(snapshot());

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The snapshot the command already returned goes straight back to the
    // session cache, so the list is current without a second read.
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ branch: "main" }));
    expect(onOperationPhaseChange).toHaveBeenCalledWith("planning");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("executing");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("success");
    expect(onOperationFinish).toHaveBeenCalledOnce();
  });

  it("branches a new line from the active one, and only from the active one", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await user.click(within(detailPanel("main")).getByRole("button", { name: "New version from this line" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("New version line");
  });

  it("opens the switch dialog from the selected line's Switch action", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Switch",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "switch-token",
      from: "main",
      to: "feature/new-thing",
      fromCommit: "abc123",
      toCommit: "def456",
      changedFiles: [],
      changedFilesTotal: 0,
    });

    await user.click(screen.getByRole("button", { name: "Switch to “feature/new-thing”" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Switch to “feature/new-thing”");
  });

  it("keeps Switch, Rename and Delete together on the selected line, and out of every row", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    // No row carries an action: the list is for choosing, not for acting on
    // every line at once.
    expect(screen.queryByRole("button", { name: /Delete “feature\/new-thing”/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename “feature\/new-thing”/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeEnabled();
    expect(within(detail).getByRole("button", { name: "Rename “feature/new-thing”" })).toBeEnabled();

    mockedInvoke.mockResolvedValueOnce({
      operationKind: "destructive",
      summary: "Delete",
      steps: [],
      risks: [],
      recovery: "Reachable from: refs/heads/main",
      requiresConfirmation: true,
      stateToken: "delete-token",
      name: "feature/new-thing",
      tipCommit: "def456",
      retainedBy: ["refs/heads/main"],
      upstream: null,
      published: null,
    });
    await user.click(within(detail).getByRole("button", { name: /Delete “feature\/new-thing”/ }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Delete “feature/new-thing”?");
  });

  it("renames a line from the same row, and follows it to its new name", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const { onSnapshot } = renderPanel({ onOperationStart });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await user.click(screen.getByRole("button", { name: "Rename “feature/new-thing”" }));
    expect(onOperationStart).toHaveBeenCalledOnce();

    const dialog = await screen.findByRole("dialog", { name: "Rename “feature/new-thing”" });
    const field = within(dialog).getByLabelText("New name");
    expect(field).toHaveValue("feature/new-thing");
    expect(
      within(dialog).getByText(
        "Only the name changes. Every saved version on this line stays exactly where it is.",
      ),
    ).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, "feature/renamed");
    const renamed = snapshot({
      lines: [snapshot().lines[0], { ...snapshot().lines[1], name: "feature/renamed" }],
    });
    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Rename",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "rename-token",
      name: "feature/new-thing",
      newName: "feature/renamed",
      isActive: false,
      upstream: null,
    });
    mockedInvoke.mockResolvedValueOnce(renamed);
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(renamed));
    expect(mockedInvoke).toHaveBeenCalledWith("rename_version_line", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/new-thing",
      newName: "feature/renamed",
      stateToken: "rename-token",
    });
  });

  it("never offers to rename or delete the project's main line", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          { ...snapshot().lines[1], name: "trunk", isDefault: true, isRetainedElsewhere: true },
        ],
      }),
    });

    // The list says why, instead of promising a cleanup it would refuse.
    const row = screen.getByRole("option", { name: "trunk" });
    expect(within(row).getByText("Main line")).toBeInTheDocument();
    expect(within(row).queryByText("Safe to delete")).not.toBeInTheDocument();

    await user.click(row);
    const detail = detailPanel("trunk");
    expect(within(detail).getByRole("button", { name: "Switch to “trunk”" })).toBeEnabled();
    expect(within(detail).queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(
      within(detail).getByText(
        "This is where the project's shared work lives, so GitOdile doesn't rename or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it("says the list is incomplete when a name cannot be represented", () => {
    renderPanel({ snapshot: snapshot({ unreadableCount: 2 }) });

    // The names themselves are never invented: the count is all the screen can
    // honestly show, and the other lines stay usable.
    expect(
      screen.getByText(/2 version lines aren't shown: their names use characters/),
    ).toBeInTheDocument();
    expect(listedNames()).toContain("feature/new-thing");
  });

  it("says up front which lines can be deleted and which can't", async () => {
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          snapshot().lines[1],
          {
            name: "feature/unmerged",
            tip: { commit: "jkl012", shortCommit: "jkl012a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: null,
            isRetainedElsewhere: false,
            uniqueCommitCount: 3,
            worktreePath: null,
            upstreamAhead: null,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    expect(await screen.findByText("Safe to delete")).toBeInTheDocument();
    expect(screen.getByText("Can't be deleted yet")).toBeInTheDocument();
  });

  it("flags drift from the upstream in the row, and explains it in the detail", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          {
            name: "feature/ahead",
            tip: { commit: "aaa111", shortCommit: "aaa111a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/ahead",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 2,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "feature/diverged",
            tip: { commit: "bbb222", shortCommit: "bbb222a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/diverged",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 1,
            upstreamBehind: 3,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "feature/gone",
            tip: { commit: "ccc333", shortCommit: "ccc333a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/gone",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: true,
            isDefault: false,
          },
          {
            name: "feature/synced",
            tip: { commit: "ddd444", shortCommit: "ddd444a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/synced",
            isRetainedElsewhere: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 5,
      }),
    });

    const rowFor = (name: string) => screen.getByRole("option", { name });
    expect(within(rowFor("feature/ahead")).getByText("2 not pushed")).toBeInTheDocument();
    expect(within(rowFor("feature/diverged")).getByText("1 not pushed, 3 not pulled")).toBeInTheDocument();
    expect(within(rowFor("feature/gone")).getByText("Remote branch deleted")).toBeInTheDocument();
    // A line that's fully pushed and pulled gets no drift chip — the "Tracks x"
    // line already says it's published.
    expect(within(rowFor("feature/synced")).queryByText("Up to date with the remote")).not.toBeInTheDocument();

    // The detail spells the same fact out in full, for every line, including
    // the unremarkable "synced" case.
    await user.click(rowFor("feature/synced"));
    const detail = detailPanel("feature/synced");
    expect(within(detail).getAllByText("Up to date with the remote").length).toBeGreaterThan(0);
    expect(
      within(detail).getByText("Your local line is in sync with origin/feature/synced."),
    ).toBeInTheDocument();
    expect(within(detail).getAllByText("origin/feature/synced").length).toBeGreaterThan(0);
    expect(within(detail).getByText("Published")).toBeInTheDocument();
    expect(within(detail).getByText("Tracking remote")).toBeInTheDocument();
  });

  it("says a local-only line has never been published, and never calls its tip published", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));

    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByText("Not published yet")).toBeInTheDocument();
    expect(
      within(detail).getAllByText("This line has never been published, so it only exists on this computer.").length,
    ).toBeGreaterThan(0);
    expect(within(detail).getByText("2 versions not on the active line")).toBeInTheDocument();
  });

  it("offers a way through to History, and says History follows the active line", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ onOpenHistory });

    expect(
      within(detailPanel("main")).getByText("View all versions, compare changes, and restore previous states."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    expect(
      within(detail).getByText("History follows the line you're on. Switch to this line to explore its own versions."),
    ).toBeInTheDocument();

    await user.click(within(detail).getByRole("button", { name: "Open in History" }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it("reads the selected line's saved versions and shows them beside its author and count", async () => {
    const user = userEvent.setup();
    const readHistory = vi.fn(async (name: string) => history(name));
    renderPanel({ readHistory });

    // Asked for the line that is selected on arrival, and for that one only.
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("main", "abc123"));
    expect(readHistory).toHaveBeenCalledOnce();

    const detail = detailPanel("main");
    await within(detail).findByText("Recent versions");
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
    // The tip's author comes from the same read — the inventory has no author
    // field, so without this call the card states the rest and no name.
    expect(within(detail).getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(within(detail).getAllByText("12 saved versions").length).toBeGreaterThan(0);

    // Selecting another line asks for that line's history, keyed by its tip.
    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("feature/new-thing", "def456"));
  });

  it("renders the whole detail without the history read, and without an error", async () => {
    // The read is the one thing on this screen that costs Git work beyond the
    // inventory. A host that does not offer it — or a call that fails — must
    // leave every other section standing.
    const readHistory = vi.fn(async () => Promise.reject(new Error("git said no")));
    renderPanel({ readHistory });

    const detail = detailPanel("main");
    await waitFor(() => expect(readHistory).toHaveBeenCalled());
    expect(within(detail).getByText("Latest saved version")).toBeInTheDocument();
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).getByText("Relationship")).toBeInTheDocument();
    expect(within(detail).queryByText("Recent versions")).not.toBeInTheDocument();
  });

  it("offers View all only on the line History actually follows", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ readHistory: async (name: string) => history(name), onOpenHistory });

    await within(detailPanel("main")).findByRole("button", { name: "View all" });
    await user.click(within(detailPanel("main")).getByRole("button", { name: "View all" }));
    expect(onOpenHistory).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const other = detailPanel("feature/new-thing");
    await within(other).findByText("Recent versions");
    expect(within(other).queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
  });

  it("says nothing about a version count a shallow clone cannot state", async () => {
    renderPanel({
      readHistory: async (name: string) => history(name, { totalCount: null }),
    });

    const detail = detailPanel("main");
    await within(detail).findByText("Recent versions");
    expect(within(detail).queryByText(/saved versions/)).not.toBeInTheDocument();
    expect(within(detail).queryByText("Saved versions")).not.toBeInTheDocument();
  });

  it("offers copy, switch, rename and delete on a right-clicked line", async () => {
    const user = userEvent.setup();
    // After `setup()`, which installs a clipboard stub of its own: ours has to
    // be the one the copy actually reaches.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    const row = screen.getByRole("option", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });

    const menu = screen.getByRole("menu", { name: "Actions for “feature/new-thing”" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy name",
      "Switch",
      "Rename",
      "Delete",
    ]);
    // Right-clicking selects, so the panel behind the menu is describing the
    // same line the menu names.
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Copy name" }));
    expect(writeText).toHaveBeenCalledWith("feature/new-thing");
    // A copy leaves no mark on screen, so the confirmation is announced.
    expect(await screen.findByText("Name copied")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("opens the same dialogs from the menu as from the detail header", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    const row = screen.getByRole("option", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: "Rename “feature/new-thing”" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    // The menu closes first: left standing, it would swallow the click that
    // dismisses the dialog's backdrop.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Rename “feature/new-thing”" })).toBeInTheDocument();
  });

  it("never offers an action from the menu that the panel itself refuses", async () => {
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          { ...snapshot().lines[1], name: "trunk", isDefault: true },
          { ...snapshot().lines[1], name: "elsewhere", worktreePath: "/other/workspace" },
        ],
      }),
    });

    // The project's main line: its name is still worth copying, and nothing
    // else is on offer.
    fireEvent.contextMenu(screen.getByRole("option", { name: "trunk" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Copy name", "Switch"]);

    // The active line has nowhere to switch to and cannot be deleted, but it
    // can be renamed.
    fireEvent.contextMenu(screen.getByRole("option", { name: "main — Active" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Copy name", "Rename"]);

    // A line another workspace holds can only have its name copied.
    fireEvent.contextMenu(screen.getByRole("option", { name: "elsewhere" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Copy name"]);
  });

  it("gives Delete the same reason in the menu as in the detail header", async () => {
    renderPanel({
      snapshot: snapshot({
        lines: [
          snapshot().lines[0],
          // Work that lives nowhere else: Delete is offered, and both surfaces
          // have to say it is the dialog that will explain the refusal — not
          // that the work is already kept somewhere.
          { ...snapshot().lines[1], isRetainedElsewhere: false },
        ],
      }),
    });

    const blocked = /“feature\/new-thing” has saved work that isn't kept anywhere else yet/;
    expect(
      within(detailPanel("main")).queryByRole("button", { name: blocked }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("option", { name: "feature/new-thing" }), {
      clientX: 210,
      clientY: 180,
    });
    expect(screen.getByRole("menuitem", { name: blocked })).toBeInTheDocument();
    expect(
      within(detailPanel("feature/new-thing")).getByRole("button", { name: blocked }),
    ).toBeInTheDocument();
  });

  it("closes the right-click menu on Escape and puts focus back on the row", async () => {
    const user = userEvent.setup();
    renderPanel();

    const row = screen.getByRole("option", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("says so when the clipboard refuses, instead of claiming the name was copied", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    fireEvent.contextMenu(screen.getByRole("option", { name: "feature/new-thing" }), {
      clientX: 210,
      clientY: 180,
    });
    await user.click(screen.getByRole("menuitem", { name: "Copy name" }));

    expect(
      await screen.findByText("GitOdile couldn't copy the name to the clipboard."),
    ).toBeInTheDocument();
    // Still open, so the failure is attached to the thing that failed.
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByText("Name copied")).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("does not open a mutation dialog when another linked workspace owns the repository", async () => {
    const onOperationStart = vi.fn(() => false);
    renderPanel({ onOperationStart });

    await userEvent.click(await screen.findByRole("button", { name: "New line" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
