import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { VersionLinesPanel } from "./VersionLinesPanel";
import type { VersionLineHistory, VersionLineVersion, VersionLinesSnapshot } from "./domain";

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

/** One saved version as the route sends it with a lane. */
function routeVersion(subject: string, commit: string): VersionLineVersion {
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    subject,
    authorName: "Ada Lovelace",
    committedAt: "2026-07-03T00:00:00Z",
  };
}

/** What the on-demand per-line read answers. Only the selected line's history
 * is ever asked for, so a stub keyed by name is all the panel can observe. */
function history(name: string, overrides: Partial<VersionLineHistory> = {}): VersionLineHistory {
  // Newest first, and the newest is this line's own tip: the read is asked for
  // by tip commit, so a stub whose first record belongs to a different line
  // describes a state the app cannot be in.
  const tip = snapshot().lines.find((line) => line.name === name)?.tip ?? {
    commit: `${name}-tip`,
    shortCommit: `${name}-tipa`,
    subject: `latest on ${name}`,
    committedAt: "2026-07-02T00:00:00Z",
  };
  return {
    name,
    totalCount: 12,
    hasMore: true,
    route: null,
    versions: [
      { ...tip, authorName: "Ada Lovelace" },
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
    expect(within(detail).getByText("Saved versions")).toBeInTheDocument();
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

  it("flags a row's states as glyphs, each explained on its tooltip and read out as the row's description", () => {
    renderPanel();

    const row = screen.getByRole("option", { name: "feature/new-thing" });
    expect(row).toHaveAccessibleDescription("Local only, Safe to delete");
    expect(row.querySelector(".state-glyph")).toHaveAttribute(
      "data-tooltip",
      "Local only — never published, so it exists only on this computer",
    );
    // Active is a glyph on the row — the word is the detail strip's, and the
    // row's accessible name still says it.
    const active = screen.getByRole("option", { name: "main — Active" });
    expect(within(active).queryByText("Active")).not.toBeInTheDocument();
    expect(active.querySelector(".state-glyph--accent")).toHaveAttribute(
      "data-tooltip",
      "Active — the line you're working on",
    );
    expect(within(detailPanel("main")).getByText("Active")).toBeInTheDocument();
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
    await user.click(screen.getByRole("radio", { name: "Name" }));
    expect(listedNames()).toEqual(["main", "alpha/oldest", "zeta/newest"]);

    // "Local first" is deliberately narrower than "not pushed": the
    // tracked zeta line is ahead, but the no-upstream alpha line comes first.
    await user.click(screen.getByRole("radio", { name: "Local first" }));
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

  it("has no button into the create dialog; the composer under the list starts a line", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: "New line" })).not.toBeInTheDocument();
    // Nor a second route from the active line's own actions.
    expect(
      within(detailPanel("main")).queryByRole("button", { name: /new version from this line/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("New line name")).toBeInTheDocument();
  });

  it("opens the create dialog when the palette asks for it and creates a line", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const onOperationFinish = vi.fn();
    const onOperationPhaseChange = vi.fn();
    const { onChanged, onSnapshot } = renderPanel({
      onOperationStart,
      onOperationFinish,
      onOperationPhaseChange,
      autoOpenCreate: true,
    });

    expect(await screen.findByRole("dialog")).toHaveTextContent("New version line");
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

  it("renames a line in the detail strip, without a dialog", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const onOperationFinish = vi.fn();
    const { onSnapshot } = renderPanel({ onOperationStart, onOperationFinish });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await user.click(screen.getByRole("button", { name: "Rename “feature/new-thing”" }));
    // Opening the field takes no lock: nothing is asked of Git until the press.
    expect(onOperationStart).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const detail = detailPanel("feature/new-thing");
    const field = within(detail).getByRole("textbox", { name: "Rename “feature/new-thing”" });
    expect(field).toHaveValue("feature/new-thing");
    expect(field).toHaveFocus();
    expect(
      within(detail).getByText("Only the name changes — every saved version stays where it is"),
    ).toBeInTheDocument();
    // Unchanged, there is nothing to rename.
    expect(within(detail).getByRole("button", { name: "Rename" })).toBeDisabled();

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
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(renamed));
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(onOperationFinish).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenCalledWith("rename_version_line", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/new-thing",
      newName: "feature/renamed",
      stateToken: "rename-token",
    });
  });

  it("says what Git would refuse in a new name before the press, and Escape puts the name back", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await user.keyboard("{F2}");
    const detail = detailPanel("feature/new-thing");
    const field = within(detail).getByRole("textbox", { name: "Rename “feature/new-thing”" });
    expect(field).toHaveFocus();

    // Taking the active line's name is a clash said as it is typed.
    await user.clear(field);
    await user.type(field, "main");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(within(detail).getByRole("button", { name: "Rename" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(within(detail).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(detail).getByRole("heading", { level: 2 })).toHaveTextContent("feature/new-thing");
    expect(onOperationStart).not.toHaveBeenCalled();
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
    expect(row).toHaveAccessibleDescription("Local only, Main line");

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

    expect(screen.getByRole("option", { name: "feature/new-thing" })).toHaveAccessibleDescription(
      "Local only, Safe to delete",
    );
    expect(screen.getByRole("option", { name: "feature/unmerged" })).toHaveAccessibleDescription(
      "Local only, Can't be deleted yet",
    );
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
    expect(rowFor("feature/ahead")).toHaveAccessibleDescription(expect.stringContaining("2 not pushed"));
    // Two arrows on the row, one sentence for a screen reader.
    expect(rowFor("feature/diverged")).toHaveAccessibleDescription(
      expect.stringContaining("1 not pushed, 3 not pulled"),
    );
    expect(rowFor("feature/diverged").textContent).toContain("1");
    expect(rowFor("feature/gone")).toHaveAccessibleDescription(expect.stringContaining("Remote branch deleted"));
    // A line that's fully pushed and pulled gets no drift chip — the detail
    // says it's published.
    expect(within(rowFor("feature/synced")).queryByText("Up to date with the remote")).not.toBeInTheDocument();

    // The detail spells the same fact out in full, for every line, including
    // the unremarkable "synced" case.
    await user.click(rowFor("feature/synced"));
    const detail = detailPanel("feature/synced");
    expect(within(detail).getAllByText("Up to date with the remote").length).toBeGreaterThan(0);
    expect(
      within(detail).getByText("Your local line is in sync with origin/feature/synced."),
    ).toBeInTheDocument();
    // The upstream is named once, in that sentence — not again in the strip
    // over it.
    expect(within(detail).getAllByText(/origin\/feature\/synced/)).toHaveLength(1);
    expect(within(detail).getByText("Published")).toBeInTheDocument();
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
    // No main line in this project, so no count: "not on the active line"
    // would be a different question asked in the same words.
    expect(within(detail).queryByText(/versions? not on/)).not.toBeInTheDocument();
  });

  it("counts a line's own versions against the main line, the active one included", async () => {
    const user = userEvent.setup();
    const [main, feature] = snapshot().lines;
    renderPanel({
      snapshot: snapshot({
        branch: "feature/new-thing",
        lines: [
          { ...main, isActive: false, isDefault: true },
          { ...feature, isActive: true },
        ],
      }),
    });

    const active = detailPanel("feature/new-thing");
    expect(within(active).getByText("This is the line you're working on")).toBeInTheDocument();
    expect(within(active).getByText("2 versions not on main")).toBeInTheDocument();

    // The main line is what the others are counted against.
    await user.click(screen.getByRole("option", { name: "main" }));
    expect(within(detailPanel("main")).queryByText(/versions? not on/)).not.toBeInTheDocument();
  });

  it("offers a way through to History, scoped to the line being looked at", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ onOpenHistory });

    expect(within(detailPanel("main")).getByRole("button", { name: "Open in History" })).toHaveAttribute(
      "title",
      "View all versions, compare changes, and restore previous states.",
    );

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    const open = within(detail).getByRole("button", { name: "Open in History" });
    expect(open).toHaveAttribute(
      "title",
      "Opens History reading “feature/new-thing”. Nothing is checked out, so this project stays where it is.",
    );

    // The line being looked at, not the line that happens to be active.
    await user.click(open);
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing");
  });

  it("reads the selected line's saved versions and shows them beside its author and count", async () => {
    const user = userEvent.setup();
    const readHistory = vi.fn(async (name: string) => history(name));
    renderPanel({ readHistory });

    // Asked for the line that is selected on arrival, and for that one only.
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("main", "abc123"));
    expect(readHistory).toHaveBeenCalledOnce();

    const detail = detailPanel("main");
    await within(detail).findByText("Saved versions");
    // The tip from the inventory, then the versions behind it from the read.
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
    // The tip's author comes from the same read — the inventory has no author
    // field, so without this call the byline states the date and no name.
    expect(within(detail).getAllByText("Ada Lovelace").length).toBeGreaterThan(0);

    // Selecting another line asks for that line's history, keyed by its tip.
    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("feature/new-thing", "def456"));
  });

  it("draws where a line left the main line, and says the numbers in words", async () => {
    const user = userEvent.setup();
    renderPanel({
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [
                    { ...routeVersion("in progress", "def456"), committedAt: "2026-07-02T00:00:00Z" },
                    routeVersion("started", "ddd000"),
                  ],
                  baseCount: 3,
                  baseVersions: [],
                  merge: null,
                  changes: null,
                },
              }
            : {},
        ),
    });

    // The main line has no route: it is what the others are measured against.
    await within(detailPanel("main")).findByText("first version");
    expect(within(detailPanel("main")).queryByRole("region", { name: "Route" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    // Never published, so both of its own versions are still on this machine.
    expect(
      within(route).getByText(/^Left main on .+\. 2 versions of its own \(2 not published yet\); main has saved 3 since\.$/),
    ).toBeInTheDocument();
  });

  it("says when a line's work came back squashed, and that the originals are only on it", async () => {
    const user = userEvent.setup();
    renderPanel({
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [],
                  baseCount: 0,
                  baseVersions: [],
                  merge: { kind: "squash", commit: "sss111", mergedAt: "2026-07-05T00:00:00Z", afterCount: 0, afterVersions: [] },
                  changes: null,
                },
              }
            : {},
        ),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    expect(
      within(route).getByText(
        /^Left main on .+\. Its work came back on .+ squashed into one version; the 2 original versions are only on this line\. main hasn't moved since\.$/,
      ),
    ).toBeInTheDocument();
    expect(route.querySelector(".version-lines-route__mark--copy")).not.toBeNull();
  });

  it("says what a line changes against main under its route, and cuts the versions short beside it", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({
      onOpenHistory,
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [],
                  baseCount: 0,
                  baseVersions: [],
                  merge: null,
                  changes: {
                    filesChanged: 3,
                    additions: 42,
                    deletions: 7,
                    files: [
                      { path: "src/app/new.ts", status: "added", additions: 30, deletions: 0 },
                      { path: "src/app/old.ts", status: "modified", additions: 12, deletions: 7 },
                      { path: "logo.png", status: "modified", additions: null, deletions: null },
                    ],
                  },
                },
              }
            : {},
        ),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    const changes = await within(detail).findByRole("region", { name: "What changes against main" });
    expect(changes).toHaveTextContent("3 files+42−7since it left");
    expect(within(changes).getByText("new.ts")).toBeInTheDocument();
    expect(within(changes).getAllByText("src/app/")).toHaveLength(2);
    expect(within(changes).getByText("binary")).toBeInTheDocument();

    // The versions step down to a short preview, with the way to the rest.
    // The read lists two of the line's twelve versions.
    await user.click(within(detail).getByRole("button", { name: "10 more in History" }));
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing");
  });

  it("keeps the route's place while the line's history is read, then draws it there", async () => {
    const user = userEvent.setup();
    let answer: (history: VersionLineHistory) => void = () => undefined;
    const [main, feature] = snapshot().lines;
    renderPanel({
      snapshot: snapshot({ lines: [{ ...main, isDefault: true }, feature] }),
      readHistory: (name: string) =>
        name === "feature/new-thing"
          ? new Promise<VersionLineHistory>((resolve) => {
              answer = resolve;
            })
          : Promise.resolve(history(name)),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const waiting = within(detailPanel("feature/new-thing")).getByRole("region", { name: "Route" });
    expect(within(waiting).getByRole("status")).toHaveTextContent("Reading where this line left main…");

    answer(
      history("feature/new-thing", {
        route: {
          base: "main",
          forkCommit: "abc123",
          forkedAt: "2026-07-01T00:00:00Z",
          ownCount: 2,
          ownVersions: [],
          baseCount: 0,
          baseVersions: [],
          merge: null,
          changes: null,
        },
      }),
    );
    // The same section, answered in place.
    expect(await within(waiting).findByText(/^Left main on .+\. 2 versions of its own/)).toBeInTheDocument();
    expect(within(waiting).queryByRole("status")).not.toBeInTheDocument();
  });

  it("holds the previous line's route while the next one is read, then gives way to it", async () => {
    const user = userEvent.setup();
    const routeOf = (ownCount: number) => ({
      base: "main",
      forkCommit: "abc123",
      forkedAt: "2026-07-01T00:00:00Z",
      ownCount,
      ownVersions: [],
      baseCount: 0,
      baseVersions: [],
      merge: null,
      changes: null,
    });
    let answer: (history: VersionLineHistory) => void = () => undefined;
    // One request for the held line, shared the way the controller shares it:
    // the press reads it, and so does the hover intent the same click starts
    // 120ms later. A fresh promise per call let that second read take
    // `answer` from the one the panel awaits whenever the run was slower than
    // the hover delay.
    let pending: Promise<VersionLineHistory> | null = null;
    const lines = withBugfixLine().lines;
    renderPanel({
      snapshot: snapshot({ lines: [{ ...lines[0], isDefault: true }, lines[1], lines[2]], totalCount: 3 }),
      readHistory: (name: string) =>
        name === "bugfix/other"
          ? (pending ??= new Promise<VersionLineHistory>((resolve) => {
              answer = resolve;
            }))
          : Promise.resolve(history(name, name === "feature/new-thing" ? { route: routeOf(2) } : {})),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await within(detailPanel("feature/new-thing")).findByText(/2 versions of its own/);

    await user.click(screen.getByRole("option", { name: "bugfix/other" }));
    const route = within(detailPanel("bugfix/other")).getByRole("region", { name: "Route" });
    // The previous line's drawing, held quieter — not an empty lane — while
    // this one's is read; the sentence waits under the loading thread.
    expect(route.querySelector(".version-lines-route__layer--held")).not.toBeNull();
    expect(within(route).getByRole("status")).toBeInTheDocument();

    answer(history("bugfix/other", { route: routeOf(5) }));
    expect(await within(route).findByText(/5 versions of its own/)).toBeInTheDocument();
    // The route's sentence says the count; the states over it do not say it
    // again.
    expect(within(detailPanel("bugfix/other")).queryByText(/versions? not on main/)).not.toBeInTheDocument();
    expect(route.querySelector(".version-lines-route__layer--held")).toBeNull();
  });

  it("starts a line's read when the pointer rests on its row, before the press", async () => {
    const readHistory = vi.fn(async (name: string) => history(name));
    renderPanel({ readHistory });
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("main", "abc123"));

    fireEvent.pointerEnter(screen.getByRole("option", { name: "feature/new-thing" }));
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("feature/new-thing", "def456"));

    // Passing over a row on the way somewhere else asks nothing.
    readHistory.mockClear();
    const row = screen.getByRole("option", { name: "feature/new-thing" });
    fireEvent.pointerEnter(row);
    fireEvent.pointerLeave(row);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("draws a line that came back by a merge, and every dot is a version that opens in History", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({
      onOpenHistory,
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [routeVersion("second step", "fff222"), routeVersion("first step", "fff111")],
                  baseCount: 1,
                  baseVersions: [routeVersion("main meanwhile", "eee111")],
                  merge: {
                    kind: "merge",
                    commit: "mmm111",
                    mergedAt: "2026-07-05T00:00:00Z",
                    afterCount: 4,
                    afterVersions: [routeVersion("main after", "eee999")],
                  },
                  changes: null,
                },
              }
            : {},
        ),
    });

    await user.click(screen.getByRole("option", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    expect(
      within(route).getByText(/^Left main on .+ and came back on .+ with 2 versions; main has saved 4 since\.$/),
    ).toBeInTheDocument();

    // A dot names its version on the tooltip and opens it on the line it is on.
    const dot = route.querySelector('[data-tooltip^="first step"]');
    expect(dot).not.toBeNull();
    fireEvent.click(dot!);
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing", "fff111");
    fireEvent.click(route.querySelector('[data-tooltip^="main meanwhile"]')!);
    expect(onOpenHistory).toHaveBeenLastCalledWith("main", "eee111");
  });

  it("renders the whole detail without the history read, and without an error", async () => {
    // The read is the one thing on this screen that costs Git work beyond the
    // inventory. A host that does not offer it — or a call that fails — must
    // leave every other section standing.
    const readHistory = vi.fn(async () => Promise.reject(new Error("git said no")));
    renderPanel({ readHistory });

    const detail = detailPanel("main");
    await waitFor(() => expect(readHistory).toHaveBeenCalled());
    expect(within(detail).getByText("Saved versions")).toBeInTheDocument();
    // The tip is the inventory's, so the list stands at one row; the versions
    // behind it are the ones the failed read would have added.
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).queryByText("an earlier step")).not.toBeInTheDocument();
    expect(within(detail).getByRole("list", { name: "Relationship" })).toBeInTheDocument();
  });

  it("keeps a version the inventory has not caught up with, rather than dropping it", async () => {
    // The two answers come from two Git calls: the inventory names the tip, the
    // read lists the versions. A save landing between them leaves the read one
    // version ahead — and taking its first record *as* the tip would drop that
    // version from the list and put its author's name against the tip.
    renderPanel({
      readHistory: async (name: string) => ({
        ...history(name),
        versions: [
          {
            commit: "zzz999",
            shortCommit: "zzz999a",
            subject: "saved a moment ago",
            authorName: "Grace Hopper",
            committedAt: "2026-07-03T00:00:00Z",
          },
          ...history(name).versions,
        ],
      }),
    });

    const detail = detailPanel("main");
    await within(detail).findByText("saved a moment ago");
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
    // The tip is not that version, so its author is not the tip's author.
    expect(within(detail).queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("opens a saved version in History from the list, not just the line", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ readHistory: async (name: string) => history(name), onOpenHistory });

    const detail = detailPanel("main");
    await within(detail).findByText("an earlier step");
    await user.click(within(detail).getByRole("button", { name: "Open “an earlier step” in History" }));
    // The line it is on and the version itself: History needs both to land on
    // the version the reader clicked.
    expect(onOpenHistory).toHaveBeenCalledWith("main", "ccc333");
  });

  it("reads a history a shallow clone cannot count, and shows it anyway", async () => {
    renderPanel({
      readHistory: async (name: string) => history(name, { totalCount: null }),
    });

    // Nothing on this screen states a total any more, so a read that cannot
    // count has nothing to withhold — it just has to render.
    const detail = detailPanel("main");
    await within(detail).findByText("Saved versions");
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
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
    // Going to it; what it can do with the active line, stated but not yet
    // offered; renaming it and taking its name; and, last, deleting it.
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Switch",
      "Merge into “main”Soon",
      "Rebase “main” onto thisSoon",
      "Compare with “main”Soon",
      "Rename",
      "Copy name",
      "Delete",
    ]);
    expect(within(menu).getByRole("menuitem", { name: /Merge into “main”/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /Rebase “main”/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /Compare with “main”/ })).toBeDisabled();
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

  it("opens the same actions from the menu as from the detail header", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    const row = screen.getByRole("option", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: "Rename “feature/new-thing”" }));

    // The menu closes first, and the rename opens where the header's does.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const field = within(detailPanel("feature/new-thing")).getByRole("textbox", {
      name: "Rename “feature/new-thing”",
    });
    await waitFor(() => expect(field).toHaveFocus());

    mockedInvoke.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.contextMenu(screen.getByRole("option", { name: "feature/new-thing" }), { clientX: 210, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: "Switch to “feature/new-thing”" }));
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
    ).toEqual(["Switch", "Copy name"]);

    // The active line has nowhere to switch to and cannot be deleted, but it
    // can be renamed.
    fireEvent.contextMenu(screen.getByRole("option", { name: "main — Active" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
    ).toEqual(["Rename", "Copy name"]);
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: /Merge into/ })).not.toBeInTheDocument();

    // A line another workspace holds can only have its name copied — and the
    // active line is never offered merging into itself.
    fireEvent.contextMenu(screen.getByRole("option", { name: "elsewhere" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
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

    await userEvent.click(screen.getByRole("option", { name: "feature/new-thing" }));
    await userEvent.click(
      within(detailPanel("feature/new-thing")).getByRole("button", { name: "Switch to “feature/new-thing”" }),
    );

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selects the line History asked for, once, without holding on to the request", async () => {
    const user = userEvent.setup();
    const onSelectLineIntentHandled = vi.fn();
    const view = renderPanel({
      selectLineIntent: "feature/new-thing",
      onSelectLineIntentHandled,
    });

    // Arrived on the line History named, not on the active one.
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();
    expect(onSelectLineIntentHandled).toHaveBeenCalledOnce();

    // The composition root clears the request as soon as it is taken, and from
    // here on the reader owns the selection: this screen stays mounted for the
    // session, so a re-render must not put the earlier line back.
    await user.click(screen.getByRole("option", { name: "main — Active" }));
    expect(detailPanel("main")).toBeInTheDocument();

    view.rerender(
      <LanguageProvider>
        <VersionLinesPanel
          projectPath="/repo"
          sessionEpoch="epoch-1"
          snapshot={snapshot()}
          error={null}
          isLoading={false}
          watcherState="watching"
          onOpenSettings={vi.fn()}
          onRefresh={vi.fn()}
          onSnapshot={vi.fn()}
          onChanged={vi.fn()}
          onSaveVersion={vi.fn()}
          onOperationStart={() => true}
          onOperationFinish={vi.fn()}
          onOperationPhaseChange={vi.fn()}
          selectLineIntent={null}
          onSelectLineIntentHandled={onSelectLineIntentHandled}
        />
      </LanguageProvider>,
    );
    expect(detailPanel("main")).toBeInTheDocument();
  });
});
