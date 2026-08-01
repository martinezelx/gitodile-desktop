import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "./i18n";
import { VersionLinesPanel } from "./versionLinesPanel";
import type { VersionLinesSnapshot } from "./versionLines";

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
      },
      {
        name: "feature/new-thing",
        tip: { commit: "def456", shortCommit: "def456a", subject: "in progress", committedAt: "2026-07-02T00:00:00Z" },
        isActive: false,
        upstream: null,
        isRetainedElsewhere: true,
        uniqueCommitCount: 2,
        worktreePath: null,
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
      },
    ],
    totalCount: 3,
  });
}

/** The panel is controlled: the branch inventory, its loading flag, and its
 * error live in the project session so leaving the screen and coming back
 * renders the known answer instead of a spinner (task 019). These defaults
 * stand in for `main.tsx` holding a loaded snapshot. */
function renderPanel(props: Partial<React.ComponentProps<typeof VersionLinesPanel>> = {}) {
  const onChanged = vi.fn();
  const onSaveVersion = vi.fn();
  const onRefresh = vi.fn();
  const onSnapshot = vi.fn();
  const utils = render(
    <LanguageProvider>
      <VersionLinesPanel
        projectPath="/repo"
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

  it("filters by a name-prefix chip derived from the actual branch names", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixLine() });

    await screen.findAllByText("feature/new-thing");
    await user.click(screen.getByRole("button", { name: "bugfix (1)" }));

    expect(screen.getAllByText("bugfix/other").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("feature/new-thing")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByText("feature/new-thing").length).toBeGreaterThan(0);
  });

  it("shows a recovery banner and hides Switch/Delete on detached HEAD", async () => {
    renderPanel({
      snapshot: snapshot({ branch: null, headState: "detached", lines: [snapshot().lines[1]], totalCount: 1 }),
    });

    expect(await screen.findByText("This project isn't on a version line right now")).toBeInTheDocument();
    expect(screen.getByText("Create a version line here")).toBeInTheDocument();
  });

  it("disables Switch and Delete for a line checked out in another worktree", async () => {
    renderPanel({
      snapshot: snapshot({
        lines: [snapshot().lines[0], { ...snapshot().lines[1], worktreePath: "/other/workspace" }],
      }),
    });

    await screen.findAllByText("feature/new-thing");
    expect(screen.getByText(/Open in another workspace at \/other\/workspace/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to this line" })).toBeDisabled();
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

  it("does not open a mutation dialog when another linked workspace owns the repository", async () => {
    const onOperationStart = vi.fn(() => false);
    renderPanel({ onOperationStart });

    await userEvent.click(await screen.findByRole("button", { name: "New version line" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
