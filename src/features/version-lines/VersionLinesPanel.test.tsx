import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { VersionLinesPanel } from "./VersionLinesPanel";
import type { VersionLinesSnapshot } from "./domain";

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
      },
    ],
    totalCount: 2,
    isTruncated: false,
    unreadableCount: 0,
    ...overrides,
  };
}

/** The default snapshot plus a third line under a different name prefix, so
 * the search box and the prefix chips have something to discriminate. */
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VersionLinesPanel", () => {
  it("lists the active line and the other local lines from the session snapshot", async () => {
    renderPanel();

    expect((await screen.findAllByText("feature/new-thing")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    expect(screen.getByText("Active")).toBeInTheDocument();
    // Reading is the caller's job now, so the screen itself never spawns Git
    // work just by being shown.
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("shows the cached list, not a spinner, while a refresh runs behind it", () => {
    renderPanel({ isLoading: true });

    expect(screen.getAllByText("feature/new-thing").length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading version lines…")).not.toBeInTheDocument();
  });

  it("loads with a spinner only when the project has no cached snapshot", () => {
    renderPanel({ snapshot: null, isLoading: true });

    expect(screen.getByText("Loading version lines…")).toBeInTheDocument();
  });

  it("keeps a stale list visible and flags it when a refresh fails", () => {
    renderPanel({ error: "Git couldn't read the version lines." });

    expect(screen.getAllByText("feature/new-thing").length).toBeGreaterThan(0);
    expect(
      screen.getByText("This is the last result we could read. The latest check didn’t work."),
    ).toBeInTheDocument();
  });

  it("filters the list by search text without hiding the active line", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await screen.findAllByText("feature/new-thing");
    await user.type(screen.getByPlaceholderText("Search version lines…"), "bugfix");

    expect(screen.getAllByText("bugfix/other").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("feature/new-thing")).toHaveLength(0);
  });

  it("filters by a name prefix derived from the actual branch names", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await screen.findAllByText("feature/new-thing");
    await user.click(screen.getByRole("button", { name: "Filter version lines" }));
    await user.click(screen.getByRole("checkbox", { name: /bugfix/ }));

    expect(screen.getAllByText("bugfix/other").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("feature/new-thing")).toHaveLength(0);
    // The trigger reports how much narrowing is in effect, so a filtered
    // list is never a mystery.
    expect(screen.getByRole("button", { name: "Filter version lines" })).toHaveTextContent("1 filter");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByText("feature/new-thing").length).toBeGreaterThan(0);
  });

  it("combines a state filter with a prefix filter instead of replacing it", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await screen.findAllByText("feature/new-thing");
    await user.click(screen.getByRole("button", { name: "Filter version lines" }));
    await user.click(screen.getByRole("checkbox", { name: /^bugfix/ }));
    await user.click(screen.getByRole("checkbox", { name: /Local only/ }));

    // Both lines are local-only, so the prefix is what still narrows the
    // list: the two groups AND together rather than one overriding the other.
    expect(screen.getAllByText("bugfix/other").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("feature/new-thing")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Filter version lines" })).toHaveTextContent("2 filters");
  });

  it("sorts the other lines by recency first, and by name when asked", async () => {
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
          },
        ],
        totalCount: 3,
      }),
    });

    const otherNames = () =>
      Array.from(document.querySelectorAll(".version-lines-list:not(.version-lines-list--active) .version-line-row__name"))
        .map((node) => node.textContent);

    await screen.findByText("zeta/newest");
    expect(otherNames()).toEqual(["zeta/newest", "alpha/oldest"]);

    // The sort control is the app's own popup, not a native <select>: the
    // latter hands its option list to the platform, which ignores the theme.
    await user.click(screen.getByRole("button", { name: "Sort version lines (Recently updated)" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Name (A–Z)" }));
    expect(otherNames()).toEqual(["alpha/oldest", "zeta/newest"]);

    // "Local-only first" is deliberately narrower than "not pushed": the
    // tracked zeta line is ahead, but the no-upstream alpha line comes first.
    await user.click(screen.getByRole("button", { name: "Sort version lines (Name (A–Z))" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Local-only first" }));
    expect(otherNames()).toEqual(["alpha/oldest", "zeta/newest"]);
  });

  it("shows a recovery banner and hides Switch/Delete on detached HEAD", async () => {
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

    await screen.findAllByText("feature/new-thing");
    expect(screen.getByText(/Open in another workspace at \/other\/workspace/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /“feature\/new-thing” is open in another workspace/ }),
    ).toBeDisabled();
  });

  it("surfaces a retry action when discovery fails with nothing cached", async () => {
    const { onRefresh } = renderPanel({
      snapshot: null,
      error: "GitOdrile couldn't load this project's version lines.",
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

    await screen.findAllByText("feature/new-thing");
    await user.click(screen.getByRole("button", { name: "New version line" }));
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

  it("says the list is incomplete when a name cannot be represented", () => {
    renderPanel({ snapshot: snapshot({ unreadableCount: 2 }) });

    // The names themselves are never invented: the count is all the screen
    // can honestly show, and the other lines stay usable.
    expect(
      screen.getByText(/2 version lines aren't shown: their names use characters/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("feature/new-thing").length).toBeGreaterThan(0);
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
          },
        ],
        totalCount: 3,
      }),
    });

    expect(await screen.findByText("Safe to delete")).toBeInTheDocument();
    expect(screen.getByText("Can't be deleted yet")).toBeInTheDocument();

    // The blocked line's Delete stays clickable so the dialog can explain
    // why and offer the way forward.
    const blocked = screen.getByRole("button", {
      name: /“feature\/unmerged” has saved work that isn't kept anywhere else yet/,
    });
    expect(blocked).toBeEnabled();
  });

  it("flags drift from the upstream, and stays quiet when there is none", async () => {
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
          },
        ],
        totalCount: 5,
      }),
    });

    await screen.findByText("2 not pushed");
    expect(screen.getByText("1 not pushed, 3 not pulled")).toBeInTheDocument();
    expect(screen.getByText("Remote branch deleted")).toBeInTheDocument();
    // A line that's fully pushed and pulled gets no drift pill — the
    // "Tracks x" pill already says it's published.
    expect(screen.queryByText("Up to date with the remote")).not.toBeInTheDocument();

    // The Details panel spells out the same fact in full, for every line,
    // including the unremarkable "synced" and "no upstream" cases.
    const syncedRow = screen.getByText("feature/synced").closest("li")!;
    await user.click(within(syncedRow).getByRole("button", { name: /Technical details/ }));
    expect(within(syncedRow).getByText("Up to date with the remote")).toBeInTheDocument();
    expect(within(syncedRow).getByText("origin/feature/synced")).toBeInTheDocument();
  });

  it("closes the filter popup on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await screen.findAllByText("feature/new-thing");
    const trigger = screen.getByRole("button", { name: "Filter version lines" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Filter version lines" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Local only/ })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("checkbox", { name: /Local only/ })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("navigates the sort menu with arrows, Home, End, and first-letter search", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findAllByText("feature/new-thing");
    const trigger = screen.getByRole("button", { name: "Sort version lines (Recently updated)" });
    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "Recently updated" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: /Name/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "Local-only first" })).toHaveFocus();
    await user.keyboard("{Home}n");
    expect(screen.getByRole("menuitemradio", { name: /Name/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("button", { name: /Sort version lines \(Name/ })).toBeInTheDocument();
  });

  it("opens the delete dialog from the row's delete button", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await screen.findAllByText("feature/new-thing");
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
    });
    await user.click(
      screen.getByRole("button", { name: /Delete “feature\/new-thing”/ }),
    );

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Delete “feature/new-thing”?");
  });

  it("does not open a mutation dialog when another linked workspace owns the repository", async () => {
    const onOperationStart = vi.fn(() => false);
    renderPanel({ onOperationStart });

    await userEvent.click(await screen.findByRole("button", { name: "New version line" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
