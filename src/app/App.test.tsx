import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import { TitlebarMenu } from "./TitlebarMenu";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type { HistoryPage, SavedVersionSummary } from "../features/history";
import type {
  GetTeamChangesPlan,
  GetTeamChangesResult,
  TeamSyncStatus,
} from "../features/sync";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class TestChannel<T> {
    onmessage?: (message: T) => void;
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
// Off by default, as in a browser or on Windows and Linux; the macOS test
// turns it on and drives the menu through the fake port.
vi.mock("./nativeAppMenu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./nativeAppMenu")>()),
  hasNativeMacWindowChrome: vi.fn(() => false),
}));
vi.mock("./nativeAppMenuAdapter", () => ({
  nativeAppMenuPort: { install: vi.fn(async () => ({ update: vi.fn(async () => undefined) })) },
}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpenFolderDialog = vi.mocked(openFolderDialog);

function invokedPath(args: unknown): unknown {
  return args && typeof args === "object" && !Array.isArray(args)
    ? Reflect.get(args, "path")
    : undefined;
}

const restoredProject: RepositoryInfo = {
  name: "restored-project",
  path: "C:\\projects\\restored-project",
  selectedPath: "C:\\projects\\restored-project",
  gitDir: "C:\\projects\\restored-project\\.git",
  commonGitDir: "C:\\projects\\restored-project\\.git",
  branch: "main",
  headState: "branch",
  kind: "repository",
  sessionEpoch: "restored-epoch",
};

const cleanStatus: WorkingTreeStatus = {
  isClean: true,
  counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
  lineTotals: null,
  entries: [],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: false,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
};

const cachedTeamSync: TeamSyncStatus = {
  state: "upToDate",
  localBranch: "main",
  localCommit: "1111111111111111111111111111111111111111",
  upstreamRemote: "origin",
  destinationBranch: "main",
  trackingRef: "refs/remotes/origin/main",
  remoteCommit: "1111111111111111111111111111111111111111",
  ahead: 0,
  behind: 0,
  knowledge: "cached",
  checkedAt: null,
  warnings: [],
  nextActions: ["checkAgain"],
  stateToken: "cached-sync",
  forecast: null,
};

const freshBehindTeamSync: TeamSyncStatus = {
  ...cachedTeamSync,
  state: "behind",
  remoteCommit: "2222222222222222222222222222222222222222",
  behind: 1,
  knowledge: "fresh",
  // Now, not long ago: Get project changes asks the remote again in the
  // background when this session's last check is older than a minute.
  checkedAt: Date.now(),
  nextActions: ["reviewAndGet"],
  stateToken: "fresh-behind",
  forecast: {
    outcome: "clear",
    integration: "fastForward",
    remoteCommit: "2222222222222222222222222222222222222222",
    incomingCount: 1,
    localCount: 0,
    incomingFileCount: 1,
    authors: ["Team"],
    authorCount: 1,
    carriedUnsavedCount: 0,
    combinedUnsaved: [],
    combinedUnsavedCount: 0,
    overlaps: [],
    overlapCount: 0,
    blocker: null,
  },
};

/** Ahead *and* behind, with no forecast: nothing says what getting would do,
 * so nothing should be recorded about it. */
const divergedTeamSync: TeamSyncStatus = {
  ...cachedTeamSync,
  state: "diverged",
  remoteCommit: "3333333333333333333333333333333333333333",
  ahead: 2,
  behind: 3,
  knowledge: "fresh",
  checkedAt: 2,
  nextActions: [],
  stateToken: "fresh-diverged",
};

const getTeamPlan: GetTeamChangesPlan = {
  operationKind: "history-mutation",
  requiresConfirmation: true,
  projectId: restoredProject.path,
  sessionEpoch: restoredProject.sessionEpoch,
  stateToken: "get-plan",
  branch: "main",
  target: { remote: "origin", destinationBranch: "main" },
  trackingRef: "refs/remotes/origin/main",
  localCommit: "1111111111111111111111111111111111111111",
  remoteCommit: "2222222222222222222222222222222222222222",
  incomingCount: 1,
  integration: "fastForward",
  incomingVersions: [{
    commit: "2222222222222222222222222222222222222222",
    shortCommit: "2222222",
    title: "Project version",
    description: null,
    committedAt: "2026-08-16T10:00:00Z",
    author: "Team",
    fileCount: 1,
  }],
  versionsTruncated: false,
  localCount: 0,
  localVersions: [],
  fileImpact: {
    totalCount: 1,
    counts: { added: 1, modified: 0, deleted: 0, renamed: 0, binary: 0 },
    files: [{ path: "team.txt", originalPath: null, category: "added", binary: false }],
    isTruncated: false,
  },
  forecast: freshBehindTeamSync.forecast!,
  mergeMessage: null,
  recovery: {
    reference: "refs/gitodile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
};

const getTeamResult: GetTeamChangesResult = {
  outcome: "completed",
  projectId: restoredProject.path,
  sessionEpoch: restoredProject.sessionEpoch,
  branch: "main",
  target: getTeamPlan.target,
  trackingRef: getTeamPlan.trackingRef,
  integration: "fastForward",
  previousCommit: getTeamPlan.localCommit,
  resultingCommit: getTeamPlan.remoteCommit,
  observedHead: getTeamPlan.remoteCommit,
  receivedCount: 1,
  combinedUnsavedCount: 0,
  recovery: {
    schemaVersion: 1,
    recoveryId: "1",
    reference: getTeamPlan.recovery.reference,
    createdAtMs: 1,
    operation: "get-team-changes",
    ownerId: "worktree-a",
    branch: "main",
    previousCommit: getTeamPlan.localCommit,
    targetCommit: getTeamPlan.remoteCommit,
    remote: "origin",
    destinationBranch: "main",
    trackingRef: getTeamPlan.trackingRef,
    stateToken: getTeamPlan.stateToken,
    retentionLimit: 20,
  },
  syncStatus: { ...cachedTeamSync, knowledge: "fresh", checkedAt: 2 },
  warnings: [],
  inspectionInstructions: null,
};

const branches = {
  branch: "main",
  headState: "branch" as const,
  currentCommit: "abc123",
  branches: [
    {
      name: "main",
      tip: { commit: "abc123", shortCommit: "abc123a", subject: "first", committedAt: "2026-07-01T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      isFinished: false,
      uniqueCommitCount: null,
      worktreePath: null,
    },
    {
      name: "feature/spike",
      tip: { commit: "def456", shortCommit: "def456a", subject: "wip", committedAt: "2026-07-02T00:00:00Z" },
      isActive: false,
      upstream: null,
      isRetainedElsewhere: true,
      isFinished: true,
      uniqueCommitCount: 1,
      worktreePath: null,
    },
  ],
  totalCount: 2,
  isTruncated: false,
  unreadableCount: 0,
};

const secondProject: RepositoryInfo = {
  ...restoredProject,
  name: "second-project",
  path: "C:\\projects\\second-project",
  selectedPath: "C:\\projects\\second-project",
  gitDir: "C:\\projects\\second-project\\.git",
  commonGitDir: "C:\\projects\\second-project\\.git",
  sessionEpoch: "second-epoch",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

/** The theme toggle lives in the rail's foot (task 189); the title bar's copy
 * is hidden by CSS while the rail shows, which jsdom does not apply. */
function railButton(name: string): HTMLElement {
  const foot = document.querySelector<HTMLElement>(".sidebar-foot");
  if (!foot) throw new Error("The rail's foot is not rendered");
  return within(foot).getByRole("button", { name });
}

describe("TitlebarMenu", () => {
  function renderMenu(overrides: Partial<React.ComponentProps<typeof TitlebarMenu>> = {}) {
    const props: React.ComponentProps<typeof TitlebarMenu> = {
      onOpenHome: vi.fn(),
      onOpenAbout: vi.fn(),
      onOpenChangelog: vi.fn(),
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onCloneProject: vi.fn(),
      onCloseProject: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenShortcuts: vi.fn(),
      hasProject: true,
      isOpeningProject: false,
      canReloadWindow: true,
      onReportIssue: vi.fn(),
      isReportingIssue: false,
      ...overrides,
    };
    render(
      <LanguageProvider>
        <TitlebarMenu {...props} />
      </LanguageProvider>,
    );
    return props;
  }

  it("implements the expected menu keyboard navigation and restores focus", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "More actions" });

    await user.click(trigger);
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Home");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{End}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("menuitem").at(-1)).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("restores the trigger before running a menu action", async () => {
    const user = userEvent.setup();
    const onOpenShortcuts = vi.fn(() => {
      expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();
    });
    renderMenu({ onOpenShortcuts });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Keyboard shortcuts" }));

    expect(onOpenShortcuts).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens Projects from the first menu item", async () => {
    const user = userEvent.setup();
    const onOpenHome = vi.fn();
    renderMenu({ onOpenHome });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.keyboard("{Enter}");
    expect(onOpenHome).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers provider-neutral cloning from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCloneProject = vi.fn();
    renderMenu({ onCloneProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clone remote project…" }));

    expect(onCloneProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers local project creation from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    renderMenu({ onCreateProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Create local project…" }));

    expect(onCreateProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("groups the app's own entries, with the changelog first and About last", async () => {
    const user = userEvent.setup();
    const onOpenChangelog = vi.fn();
    renderMenu({ onOpenChangelog });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const names = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(names.slice(-5)).toEqual(["What's new", "Check for updates", "About GitOdile", "Report an issue", "Reload window"]);

    await user.click(screen.getByRole("menuitem", { name: "What's new" }));
    expect(onOpenChangelog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("starts the shared application-update flow from More actions", async () => {
    const user = userEvent.setup();
    const onCheckAppUpdates = vi.fn();
    renderMenu({ onCheckAppUpdates });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Check for updates" }));
    expect(onCheckAppUpdates).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps reload focusable but unavailable while an operation is unsettled", async () => {
    const user = userEvent.setup();
    renderMenu({ canReloadWindow: false });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const reload = screen.getByRole("menuitem", { name: /Reload window.*Wait for the current operation to finish/ });
    expect(reload).toHaveAttribute("aria-disabled", "true");
    await user.click(reload);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("App on macOS", () => {
  it("leaves window controls and the overflow menu to macOS and runs menu bar entries", async () => {
    const { hasNativeMacWindowChrome } = await import("./nativeAppMenu");
    const { nativeAppMenuPort } = await import("./nativeAppMenuAdapter");
    vi.mocked(hasNativeMacWindowChrome).mockReturnValue(true);
    mockedInvoke.mockImplementation(() => Promise.reject(new Error("No project open")));
    try {
      render(<LanguageProvider><App /></LanguageProvider>);

      expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Minimize window" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Close window" })).toBeNull();
      expect(document.querySelector(".app-window")).toHaveClass("app-window--mac-traffic-lights");

      const install = vi.mocked(nativeAppMenuPort.install);
      await waitFor(() => expect(install).toHaveBeenCalled());
      const [sections, onCommand] = install.mock.calls[0];
      expect(sections.map((section) => section.text)).toEqual(["GitOdile", "File", "Edit", "View", "Window", "Help"]);

      act(() => onCommand("keyboard-shortcuts"));
      expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // The menu may trail the app by a render: an entry clicked while a
      // dialog owns the screen does nothing, as its shortcut would.
      act(() => onCommand("about"));
      // The shortcut sheet borrows `.about-dialog`; About's own hero does not.
      expect(document.querySelector(".about-dialog__hero")).toBeNull();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    } finally {
      vi.mocked(hasNativeMacWindowChrome).mockReturnValue(false);
    }
  });
});

describe("App project restoration", () => {
  it("keeps the issue error as the only focus trap when a palette shortcut is pressed", async () => {
    const user = userEvent.setup();
    vi.mocked(openUrl).mockRejectedValue(new Error("browser unavailable"));
    mockedInvoke.mockImplementation((command) => command === "render_diagnostic_report"
      ? Promise.resolve("Environment\n-----------\nGitOdile test\n\nSession activity\n----------------\nNo activity has been recorded in this session.")
      : Promise.resolve(undefined));
    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Report an issue" }));
    await user.click(await screen.findByRole("button", { name: "Open issue" }));
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("The browser didn't open");
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("opens a Spanish report with the Git diagnostics supplied by the composition root", async () => {
    const user = userEvent.setup();
    localStorage.setItem("gitodile-language", "es");
    vi.mocked(openUrl).mockResolvedValue(undefined);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "render_diagnostic_report") {
        return Promise.resolve("Environment\n-----------\nGitOdile test\nGit: 2.50.0\n\nSession activity\n----------------\nNo activity has been recorded in this session.");
      }
      return Promise.reject(new Error("No project open"));
    });

    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(screen.getByRole("menuitem", { name: "Reportar un problema" }));
    await user.click(await screen.findByRole("button", { name: "Reportar en GitHub" }));

    expect(openUrl).toHaveBeenCalledOnce();
    const url = new URL(vi.mocked(openUrl).mock.calls[0][0]);
    expect(url.pathname).toBe("/martinezelx/gitodile/issues/new");
    expect(url.searchParams.get("template")).toBe("bug-es.yml");
    expect(url.searchParams.get("diagnostics")).toContain("Git: 2.50.0");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("wires the status bar to the active project and its remote check", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(<LanguageProvider><App /></LanguageProvider>);

    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });
    expect(within(statusBar).getByText("main")).toBeInTheDocument();
    expect(within(statusBar).getByText("Everything is saved")).toBeInTheDocument();
    expect(await within(statusBar).findByText("Up to date")).toBeInTheDocument();
    expect(within(statusBar).getByText("Up to date").closest(".status-bar__sync")).toHaveAttribute(
      "data-tooltip",
      expect.stringContaining("Local snapshot"),
    );

    await userEvent.click(within(statusBar).getByRole("button", { name: "Check remote project changes" }));
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("check_team_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
    });

    await userEvent.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    expect(within(palette).getByText("Check local changes")).toBeInTheDocument();
    expect(within(palette).getByText("Check remote project changes")).toBeInTheDocument();
    expect(within(palette).getByText("Check for updates")).toBeInTheDocument();
    await userEvent.click(within(palette).getByText("Check for updates"));
    expect(screen.getByRole("dialog", { name: "Updates" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // The strip carries no version: the release notes open from the overflow
    // menu now, where the update check sits beside them.
    expect(within(statusBar).queryByRole("button", { name: /What's new/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "What's new" }));
    const changelog = screen.getByRole("dialog", { name: "What's new" });
    expect(within(changelog).getByRole("heading", { name: __APP_VERSION__ })).toBeInTheDocument();
    expect(within(changelog).getByText("Your version")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // The titlebar carries no mark, so About opens from the overflow menu.
    expect(screen.queryByRole("button", { name: "About" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "About GitOdile" }));
    expect(screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." })).toBeInTheDocument();
  });

  it("records both outcomes of an automatic check, and offers the review flow from the notification", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-remote-check-interval", "1");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "plan_get_team_changes") return Promise.resolve(getTeamPlan);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    // Fake timers must be installed before the render: the cadence registers
    // its interval from a mount effect, and an interval created against the
    // real clock cannot be advanced afterwards.
    //
    // They also rule out Testing Library's async helpers for the rest of the
    // test — `waitFor` only advances *jest* fake timers, so under vitest's it
    // waits on a clock nobody is moving. Hence the explicit settle loop and
    // `fireEvent` instead of `userEvent`.
    vi.useFakeTimers();
    try {
      const settle = async (ms = 0): Promise<void> => {
        await vi.advanceTimersByTimeAsync(ms);
        await vi.advanceTimersByTimeAsync(0);
      };
      render(<LanguageProvider><App /></LanguageProvider>);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (screen.queryByRole("contentinfo", { name: "Project status" })) break;
        await settle(25);
      }
      expect(screen.getByRole("contentinfo", { name: "Project status" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();

      // The cadence, not a press: this is the only check nobody is watching,
      // and therefore the only one worth putting in an inbox.
      await settle(60_000);
      const unreadBell = screen.getByRole("button", { name: "Notifications, 1 unread" });

      fireEvent.click(unreadBell);
      const panel = screen.getByRole("dialog", { name: "Notifications" });
      expect(within(panel).getByText("1 newer version is available")).toBeInTheDocument();
      // Opening the inbox is not acknowledgment.
      expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();

      fireEvent.click(within(panel).getByRole("button", { name: "Review and get" }));
      expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
      await settle(50);
      expect(screen.getByRole("dialog", { name: "Get 1 version from origin" })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      await settle(50);

      // The other half of the same cadence: a check that could not reach the
      // remote is the outcome most likely to be erased by the next successful
      // one, so it is exactly what an inbox is for.
      mockedInvoke.mockImplementation((command) => {
        if (command === "check_team_changes") return Promise.reject(new Error("host unreachable"));
        if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
        if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
        if (command === "list_unpublished_versions") {
          return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
        }
        if (command === "get_branches") return Promise.resolve(branches);
        if (command === "watch_repository") return Promise.resolve(true);
        if (command === "unwatch_repository") return Promise.resolve();
        return Promise.reject(new Error(`Unexpected command: ${command}`));
      });
      await settle(60_000);

      fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
      const afterFailure = screen.getByRole("dialog", { name: "Notifications" });
      expect(
        within(afterFailure).getByText("Couldn't check for project changes"),
      ).toBeInTheDocument();
      expect(within(afterFailure).getAllByRole("listitem")).toHaveLength(2);
      fireEvent.click(within(afterFailure).getByRole("button", { name: "Mark all as read" }));
      fireEvent.keyDown(document, { key: "Escape" });
      await settle(50);

      // A diverged upstream with no forecast: nothing says what getting would
      // do, so nothing is recorded rather than handing someone a button that
      // declines.
      mockedInvoke.mockImplementation((command) => {
        if (command === "check_team_changes") return Promise.resolve(divergedTeamSync);
        if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
        if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
        if (command === "list_unpublished_versions") {
          return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
        }
        if (command === "get_branches") return Promise.resolve(branches);
        if (command === "watch_repository") return Promise.resolve(true);
        if (command === "unwatch_repository") return Promise.resolve();
        return Promise.reject(new Error(`Unexpected command: ${command}`));
      });
      await settle(60_000);

      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
      const afterDiverged = screen.getByRole("dialog", { name: "Notifications" });
      expect(within(afterDiverged).getAllByRole("listitem")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the notification bell beside the window controls and records nothing for a manual check", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(<LanguageProvider><App /></LanguageProvider>);

    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });
    const bell = screen.getByRole("button", { name: "Notifications" });
    const windowControls = document.querySelector(".window-controls");
    expect(windowControls).not.toBeNull();
    // Placement is the requirement, not just presence: the bell is the last
    // thing before the operating system's own buttons.
    expect(
      bell.compareDocumentPosition(windowControls as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // A check the user pressed is answered by the status bar they were looking
    // at. Recording it as well would be reporting the news to its own author.
    await userEvent.click(
      within(statusBar).getByRole("button", { name: "Check remote project changes" }),
    );
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("All caught up")).toBeInTheDocument();
  });

  it("opens the collapsed-rail jump menu on hover without taking the caret", async () => {
    localStorage.setItem("gitodile-sidebar-hidden", "true");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: null, email: null });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(<LanguageProvider><App /></LanguageProvider>);
    const toggle = await screen.findByRole("button", { name: "Show sidebar" });
    toggle.focus();

    fireEvent.mouseEnter(toggle);

    // The menu is a pointer affordance: it opens on hover and closes itself
    // again on mouse-leave. Focusing it would move the caret because someone
    // moved the mouse, and then destroy the element holding it. Every other
    // flyout in the app opens from a click and does take focus.
    expect(await screen.findByRole("menu", { name: "Project navigation" })).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("opens the eager clone flow from the empty state and command palette", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Clone a remote project" }));
    expect(screen.getByRole("dialog", { name: "Clone a project" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "Clone a remote project");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Clone a project" })).toBeInTheDocument();
  });

  it("welcomes with three described entry points under a single heading", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The greeting is the only page heading: the shell no longer also titles
    // this screen "Overview" above it. Without a Git name it greets nobody in
    // particular rather than an empty name.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)$/);
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();

    // The launcher field is where the cursor lands.
    expect(screen.getByRole("textbox", { name: "Find a project, or paste a path or URL" })).toHaveFocus();

    // The mascot greets here, not in the titlebar, and stays decorative.
    const welcomeMascot = document.querySelector(".home-launcher .gitodile-mascot");
    expect(welcomeMascot).toHaveAttribute("aria-hidden", "true");
    expect(welcomeMascot).toHaveClass("gitodile-mascot--body", "gitodile-mascot--blink", "gitodile-mascot--enter", "home-launcher__mascot");
    expect(document.querySelector(".window-titlebar .gitodile-mascot")).toBeNull();

    // Each hint has to stay a *description*: folded into the name instead, it
    // would break every "Open a project" lookup in the app.
    for (const [name, hint] of [
      ["Create a local project", "A new or existing folder"],
      ["Open a project", "A folder that uses Git"],
      ["Clone a remote project", "Download from a server"],
    ]) {
      expect(screen.getByRole("button", { name, description: hint })).toBeEnabled();
    }
  });

  it("offers recent projects on the welcome screen, opens one, and forgets one", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({
        version: 1,
        entries: [
          { path: restoredProject.path, name: restoredProject.name },
          { path: secondProject.path, name: secondProject.name },
        ],
      }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The path is the row's description, not part of its name: two projects
    // can share a folder name, and the name alone has to stay the label.
    const recent = screen.getByRole("button", {
      name: secondProject.name,
      description: secondProject.path,
    });
    expect(recent).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Remove ${secondProject.name} from recent projects` }));
    expect(screen.queryByRole("button", { name: secondProject.name })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-recent-projects") ?? "{}")).toEqual({
      version: 1,
      entries: [{ path: restoredProject.path, name: restoredProject.name }],
    });

    // Opening a recent goes through the same open path as the folder picker —
    // no dialog, and the picker is never reached.
    await user.click(screen.getByRole("button", { name: restoredProject.name }));
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("open_repository", {
        path: restoredProject.path,
        sessionEpoch: undefined,
      }),
    );
    expect(mockedOpenFolderDialog).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).not.toBeInTheDocument(),
    );
  });

  it("fills in Home's accounts once the launch check lands, instead of showing none", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: restoredProject.path, name: restoredProject.name }] }),
    );
    const providers = [{ id: "github", host: "github.com", kind: "github", builtIn: true }];
    const account = { id: "github:martinezelx", provider: "github", host: "github.com", login: "martinezelx", avatarDataUrl: null };
    let reads = 0;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.55.0.windows.3" });
      if (command === "get_git_identity") return Promise.resolve({ name: "Luis", email: "luis@example.com" });
      if (command === "get_account_catalog") {
        reads += 1;
        // First read: the launch check is scheduled and the saved connection
        // is not verified yet. Second: the check has landed.
        return Promise.resolve(
          reads === 1
            ? { providers, accounts: [{ ...account, available: false }], busy: true }
            : { providers, accounts: [{ ...account, available: true }], busy: false },
        );
      }
      return Promise.resolve(undefined);
    });
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    const status = await screen.findByRole("group", { name: "This computer" });
    // Unknown, not "none": no premature invitation to connect an account.
    expect(within(status).queryByRole("button", { name: "Connect an account" })).not.toBeInTheDocument();

    // The tab row holds a place while the check runs, then the tab lands in it.
    const tabs = screen.getByRole("group", { name: "Show" });
    expect(await within(tabs).findByRole("button", { name: "GitHub" }, { timeout: 3000 })).toBeInTheDocument();
    expect(tabs.querySelector(".home-launcher__tab--placeholder")).toBeNull();
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it("keeps a place for each provider whose saved connection is still being checked", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: restoredProject.path, name: restoredProject.name }] }),
    );
    const providers = [
      { id: "github", host: "github.com", kind: "github", builtIn: true },
      { id: "gitlab", host: "gitlab.com", kind: "gitlab", builtIn: true },
    ];
    const github = { id: "github:martinezelx", provider: "github", host: "github.com", login: "martinezelx", avatarDataUrl: null };
    const gitlab = { id: "gitlab:token.martinezelx", provider: "gitlab", host: "gitlab.com", login: "martinezelx", avatarDataUrl: null };
    let reads = 0;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.55.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "Luis", email: "luis@example.com" });
      if (command === "get_account_catalog") {
        reads += 1;
        // GitHub's check lands first; GitLab's a read later.
        return Promise.resolve(
          reads === 1
            ? { providers, accounts: [{ ...github, available: true }, { ...gitlab, available: false }], busy: true }
            : { providers, accounts: [{ ...github, available: true }, { ...gitlab, available: true }], busy: false },
        );
      }
      return Promise.resolve(undefined);
    });
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    const tabs = await screen.findByRole("group", { name: "Show" });
    expect(await within(tabs).findByRole("button", { name: "GitHub" })).toBeInTheDocument();
    if (reads === 1) expect(tabs.querySelectorAll(".home-launcher__tab--placeholder")).toHaveLength(1);
    expect(await within(tabs).findByRole("button", { name: "GitLab" }, { timeout: 3000 })).toBeInTheDocument();
    expect(tabs.querySelector(".home-launcher__tab--placeholder")).toBeNull();
  });

  it("lists favourite recents in their own tab, sharing the switcher's own store", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({
        version: 1,
        entries: [
          { path: secondProject.path, name: secondProject.name },
          { path: restoredProject.path, name: restoredProject.name },
        ],
      }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // Newest first: the newest project leads as Continue, the next is listed.
    expect(screen.getByRole("button", { name: secondProject.name })).toHaveClass("home-launcher__continue");
    // No Favorites tab until there is a favourite. (Other tabs, such as a
    // connected account's, may already be there.)
    expect(screen.queryByRole("button", { name: "Favorites" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: `Add ${restoredProject.name} to favorites` }),
    );

    // The mark is the app's own project favourite, not a row-local flag.
    expect(JSON.parse(localStorage.getItem("gitodile-favourite-projects") ?? "[]")).toEqual([
      restoredProject.path,
    ]);
    const star = screen.getByRole("button", {
      name: `Remove ${restoredProject.name} from favorites`,
    });
    expect(star).toHaveAttribute("aria-pressed", "true");

    // With a favourite, the launcher offers a Favorites tab beside Recent;
    // there only favourites are listed. A view, not a setting: nothing is stored.
    const tabs = screen.getByRole("group", { name: "Show" });
    await user.click(within(tabs).getByRole("button", { name: "Favorites" }));
    expect(within(tabs).getByRole("button", { name: "Favorites" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: secondProject.name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: restoredProject.name })).toBeInTheDocument();
    await user.click(within(tabs).getByRole("button", { name: "Recent" }));
    expect(screen.getByRole("button", { name: secondProject.name })).toBeInTheDocument();
  });

  it("remembers a project it opened, newest first", async () => {
    mockedOpenFolderDialog.mockResolvedValue(secondProject.path);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(secondProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: restoredProject.path, name: restoredProject.name }] }),
    );
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Open a project" }).at(-1)!);

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodile-recent-projects") ?? "{}")).toEqual({
        version: 1,
        entries: [
          { path: secondProject.path, name: secondProject.name, openedAt: expect.any(Number) },
          { path: restoredProject.path, name: restoredProject.name },
        ],
      }),
    );
  });

  it("opens the eager local-creation flow from the empty state", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Create a local project" }));
    expect(screen.getByRole("dialog", { name: "Create a project" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Location")).toHaveFocus());
  });

  it("offers contextual initialization when an opened folder is not a repository", async () => {
    mockedOpenFolderDialog.mockResolvedValue("C:\\ordinary folder");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      if (command === "open_repository") {
        return Promise.reject({
          code: "not_repository",
          message: "This folder is not a Git repository.",
          remediation: "Choose a repository.",
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "Open a project" }).at(-1)!);

    // The message names two ways out and the dialog offers both: choosing
    // another folder steps down to secondary, turning this one into a project
    // is the primary. The alert describes itself through its message rather
    // than announcing it a second time as a live region.
    const alert = await screen.findByRole("alertdialog", { name: "Couldn't open that project" });
    expect(alert).toHaveAccessibleDescription(/doesn't use Git yet/);
    const recovery = within(alert).getByRole("button", { name: "Turn into a project" });
    expect(recovery).toHaveClass("primary-button");
    expect(within(alert).getByRole("button", { name: "Choose another folder" })).toHaveClass("secondary-button");

    await user.click(recovery);
    expect(screen.getByRole("dialog", { name: "Create a project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Folder")).toHaveValue("C:\\ordinary folder");
  });

  it("hands off the account popover before shell shortcuts and restores a live focus target", async () => {
    localStorage.setItem("gitodile-language", "en");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    const account = screen.getByRole("button", { name: "Sign in · Account demo" });
    await user.click(account);
    expect(screen.getByRole("dialog", { name: "Your GitOdile account" })).toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Your GitOdile account" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(account).toHaveFocus());
    await user.click(account);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Your GitOdile account" })).not.toBeInTheDocument();
  });

  it("runs the account demo from Settings with one modal focus owner and a shared session", async () => {
    localStorage.setItem("gitodile-language", "en");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const settings = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(settings).getByRole("tab", { name: "Account" }));
    await user.selectOptions(within(settings).getByLabelText("Demo result"), "waiting");
    const start = within(settings).getByRole("button", { name: "Try sign-in" });
    await user.click(start);
    expect(settings).toHaveAttribute("inert");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const waiting = screen.getByRole("dialog", { name: "Waiting for the browser…" });
    await user.keyboard("{Tab}");
    expect(waiting).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(settings).not.toHaveAttribute("inert");
    await waitFor(() => expect(start).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Settings" })).toBe(settings);
    await user.selectOptions(within(settings).getByLabelText("Demo result"), "pro");
    await user.click(start);
    await waitFor(() => expect(within(settings).getByText("Pro · Demo")).toBeVisible(), { timeout: 5000 });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Luis Martinez · Account demo" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByText("Pro · Demo")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(screen.getByLabelText("Demo result")).toHaveValue("success");
    expect(screen.getByRole("button", { name: "Sign in · Account demo" })).toBeInTheDocument();
  }, 15000);

  it("opens Settings as a sectioned dialog without replacing the active screen", async () => {
    vi.stubEnv("DEV", false);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    const trigger = screen.getAllByRole("button", { name: "Settings" })[0];
    expect(trigger).toHaveAttribute("data-tooltip", "Settings");
    const login = screen.getByRole("button", { name: "Sign in — coming soon" });
    expect(login).toHaveAttribute("aria-disabled", "true");
    expect(login).toHaveAttribute("data-tooltip", "Sign in — coming soon");
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).queryByRole("tab", { name: "Account" })).toBeNull();
    // Synchronous on purpose: the panel is eager, so the dialog and its content
    // land in the same commit. Making the overlay lazy again would fail here
    // before it could reach the user as a fallback frame.
    expect(within(dialog).getByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Startup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    // Focus lands on the section rail, not on Close: Enter right after opening
    // should not shut the dialog the user just asked for.
    await waitFor(() => expect(within(dialog).getByRole("tab", { name: "General" })).toHaveFocus());

    await user.click(within(dialog).getByRole("tab", { name: "Language & region" }));
    expect(within(dialog).getByRole("heading", { name: "Language" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(trigger).toHaveFocus();

    // Opening without naming a section starts at General every time, however
    // the last visit ended. Callers that want another one say so.
    await user.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Settings" });
    expect(within(reopened).getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(reopened).getByRole("tab", { name: "Interface" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await user.keyboard("{Escape}");

    // Ctrl/Cmd+, is the desktop convention for preferences, and lands on
    // General like every other plain opener.
    await user.keyboard("{Control>},{/Control}");
    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole("tab", { name: "General" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");

    // …but never on top of another dialog: two focus traps would compete.
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    await user.keyboard("{Escape}");

    // A named palette entry still lands on its section rather than General.
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "Settings: Git");
    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole("tab", { name: "Git" }),
    ).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: "Customize navigation bar" }));
    const navigationSettings = within(screen.getByRole("dialog", { name: "Settings" }));
    expect(navigationSettings.getByRole("tab", { name: "Navigation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(navigationSettings.getByRole("switch", { name: "Show Work in the sidebar" }));
    await user.click(navigationSettings.getByRole("radio", { name: /Icons only/ }));
    await user.keyboard("{Escape}");

    const projectNavigation = screen.getByRole("navigation", { name: "Project navigation" });
    expect(projectNavigation).toHaveClass("rail-nav--icons-only");
    expect(within(projectNavigation).queryByRole("button", { name: "Work" })).toBeNull();
    await user.click(within(projectNavigation).getByRole("button", { name: "More" }));
    expect(
      within(screen.getByRole("menu", { name: "More" })).getByText(
        "Work — open a project first",
      ),
    )
      .toBeInTheDocument();
  });

  it("re-reads the open project once when watching is turned back on", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    // Launched with watching off, so the restored project is as stale as
    // whatever happened on disk while the app was closed.
    localStorage.setItem("gitodile-watch-projects", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    let statusReads = 0;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        statusReads += 1;
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "read_team_sync_status") {
        return Promise.resolve(cachedTeamSync);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() => expect(statusReads).toBeGreaterThan(0));
    const readsBeforeToggle = statusReads;

    await userEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    await userEvent.click(screen.getByRole("switch", { name: "Keep project screens up to date" }));

    // Re-registering only catches what changes next, so turning it back on
    // has to close the gap itself — without the project being reopened.
    await waitFor(() => expect(statusReads).toBe(readsBeforeToggle + 1));
    expect(localStorage.getItem("gitodile-watch-projects")).toBe("true");
  });

  it("animates every theme change the same way", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    // jsdom has no view transitions, so the app would take its instant path and
    // this would assert nothing. The mode is read at capture time, which is the
    // only moment it is observable.
    const modes: Array<string | undefined> = [];
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (callback: () => void) => {
        callback();
        modes.push(document.documentElement.dataset.themeTransition);
        return { finished: Promise.resolve(), ready: Promise.resolve(), skipTransition: vi.fn() };
      },
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The rail's toggle and Settings reach the same animation: the toggle's own
    // origin-anchored sweep was withdrawn, and "system" never had an origin.
    await user.click(railButton("Switch to dark theme"));
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("tab", { name: "Interface" }));
    await user.click(within(dialog).getByRole("radio", { name: /GitOdile Light/ }));

    expect(modes).toEqual(["fade", "fade"]);

    // Re-picking the option already in effect must not snapshot the window to
    // cross-fade it into an identical frame.
    await user.click(within(dialog).getByRole("radio", { name: /GitOdile Light/ }));
    expect(modes).toEqual(["fade", "fade"]);

    Reflect.deleteProperty(document, "startViewTransition");
    delete document.documentElement.dataset.themeTransition;
  });

  // ADR 0015: a community theme has no official counterpart, so the toggle
  // hands control back to the device; from there it flips the official pair.
  it("sends a community theme back to the device, then flips the official pair", async () => {
    localStorage.setItem("gitodile-theme", "catppuccin-mocha");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("catppuccin-mocha"),
    );
    await user.click(railButton("Use system theme"));
    // "Match device" keeps no attribute, so the media query follows the device.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined());

    // With the device selected, the toggle flips the official pair. jsdom's
    // prefers-color-scheme is light, so the first flip is to the official dark.
    await user.click(railButton("Switch to dark theme"));
    expect(document.documentElement.dataset.theme).toBe("gitodile-dark");
    await user.click(railButton("Switch to light theme"));
    expect(document.documentElement.dataset.theme).toBe("gitodile-light");
  });

  it("does not overwrite stored projects before startup revalidation completes", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path],
        activeId: restoredProject.path,
      }),
    );

    let resolveOpen: ((project: RepositoryInfo) => void) | undefined;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return new Promise<RepositoryInfo>((resolve) => {
          resolveOpen = resolve;
        });
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        // The idle-time branch-inventory prefetch (task 019). Answered here
        // so it stays a background no-op rather than an unexpected command.
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("open_repository", {
        path: restoredProject.path,
      }),
    );
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}")).toEqual({
      version: 1,
      order: [restoredProject.path],
      activeId: restoredProject.path,
    });
    // Overview is already the destination: while revalidation runs it stays a
    // placeholder in its own shape rather than flashing the launcher.
    expect(document.querySelector(".empty-state--welcome")).toBeNull();
    expect(screen.getByText("Opening project…").closest('[role="status"]')).toHaveAttribute("aria-busy", "true");

    resolveOpen?.(restoredProject);
    expect(
      await screen.findByRole("heading", { name: restoredProject.name }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}")).toEqual({
        version: 1,
        order: [restoredProject.path],
        activeId: restoredProject.path,
      }),
    );
  });

  it("refreshes a project's local status whenever it becomes active", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path, secondProject.path],
        activeId: restoredProject.path,
      }),
    );

    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(
          invokedPath(args) === secondProject.path ? secondProject : restoredProject,
        );
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        // The idle-time branch-inventory prefetch (task 019). Answered here
        // so it stays a background no-op rather than an unexpected command.
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(1),
    );

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }),
    );
    await userEvent.click(screen.getByRole("button", { name: `Switch to ${secondProject.name}` }));

    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(2),
    );
  });

  it("keeps the global remote check narrow and refreshes local facts after a completed team update", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    let checkedRemote = false;
    let appliedUpdate = false;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") {
        return Promise.resolve(
          appliedUpdate
            ? cachedTeamSync
            : checkedRemote
              ? { ...freshBehindTeamSync, knowledge: "cached", checkedAt: null }
              : cachedTeamSync,
        );
      }
      if (command === "check_team_changes") {
        checkedRemote = true;
        return Promise.resolve(freshBehindTeamSync);
      }
      if (command === "plan_get_team_changes") {
        return Promise.resolve(getTeamPlan);
      }
      if (command === "get_team_changes") {
        appliedUpdate = true;
        return Promise.resolve(getTeamResult);
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    const localReadsBeforeRemoteCheck = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const repositoryOpensBeforeRemoteCheck = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    const statusBar = screen.getByRole("contentinfo", { name: "Project status" });
    await userEvent.click(
      within(statusBar).getByRole("button", { name: "Check remote project changes" }),
    );
    // Overview's next-step card is where the answer lands now. The status bar
    // says the same words, so the card is found by its title's class.
    expect(
      (await screen.findAllByText(/^1 new version (on|available)/)).some((node) =>
        node.classList.contains("next-step__title"),
      ),
    ).toBe(true);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status"),
    ).toHaveLength(localReadsBeforeRemoteCheck);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "open_repository"),
    ).toHaveLength(repositoryOpensBeforeRemoteCheck);
    // Overview's card and the status bar both offer the get; this takes the
    // status bar's, the one every screen carries.
    await userEvent.click(await within(statusBar).findByRole("button", { name: "Get 1 version" }));
    // The confirmation opens behind an async plan call, which under a loaded
    // parallel run needs more than the one-second default (task 072).
    const confirm = await screen.findByRole(
      "button",
      { name: "Get" },
      { timeout: 3000 },
    );
    // The status bar's project popup disables switching and closing while
    // the plan is open (ProjectSwitcher.test.tsx covers the rows).

    const readsBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const opensBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    await userEvent.click(confirm);
    await screen.findByText("Project up to date. 1 version came in.");

    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status"),
    ).toHaveLength(readsBefore + 1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "open_repository"),
    ).toHaveLength(opensBefore + 1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "get_team_changes"),
    ).toHaveLength(1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "check_team_changes"),
    ).toHaveLength(1);
  });

  it("saves a version from Overview without leaving Overview", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    const dirtyStatus: WorkingTreeStatus = {
      ...cleanStatus,
      isClean: false,
      counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
      entries: [{ path: "notes.md", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true }],
      hasUnpreparedChanges: true,
    };

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(dirtyStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "plan_save_version") {
        return Promise.resolve({
          operationKind: "history-mutation",
          requiresConfirmation: true,
          stateToken: "token",
          branch: "main",
          isFirstVersion: false,
          totalFiles: 1,
          remainingFiles: 0,
          isPartial: false,
          hasPreparedChanges: false,
          counts: dirtyStatus.counts,
          files: [],
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });

    // The band's active tile is the action, once both sides have been read.
    await userEvent.click(await screen.findByRole("button", { name: "Save version" }));

    // The dialog opens here, and Overview stays the screen: nothing was
    // navigated, and the planner was asked to save everything.
    expect(await screen.findByRole("dialog", { name: "Save version" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
      selectedPaths: null,
    });
  });

  it("restores a discard from Overview, and stays there when nothing was restored", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    const record = {
      recoveryId: "discard-1", createdAtMs: Date.now() - 60_000, fileCount: 1, selectedPath: null,
      previewPaths: ["gone.txt"], stateToken: "token-1", availability: "restorable" as const,
      restoresPreparedState: true,
    };

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "list_discard_recoveries") return Promise.resolve([record]);
      if (command === "get_discard_recovery") return Promise.resolve(record);
      if (command === "restore_discarded_changes") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });
    await screen.findByText("Discarded changes", undefined, { timeout: 5000 });

    // The picker opens over Overview; closing it without restoring leaves
    // Overview where it was.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    const picker = await screen.findByRole("dialog", { name: "Restore discarded changes" });
    expect(await within(picker).findByText("gone.txt")).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restore discarded changes" })).toBeNull());
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();

    // A restore moves on to Changes, which says what came back.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    const again = await screen.findByRole("dialog", { name: "Restore discarded changes" });
    await within(again).findByText("gone.txt");
    await userEvent.click(within(again).getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("heading", { name: "Changes" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("1 file restored.", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("restore_discarded_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
      recoveryId: "discard-1",
      stateToken: "token-1",
    });
  });

  it("defaults to the first file/version and preserves user context across palette, rail and tab navigation", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }));
    const files = ["README.md", "src/z.ts", "src/a.ts"].map((path) => ({ path, originalPath: null, category: "changed" as const }));
    const versions: SavedVersionSummary[] = [2, 1].map((index) => ({
      commit: String(index).repeat(40), shortCommit: String(index).repeat(7), parents: [],
      subject: index === 2 ? "Newest version" : "Older version", description: "",
      author: { name: "Ada", email: "ada@example.test" },
      authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 0 },
      committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 0 },
      decorations: [], isRoot: true, isMerge: false, publication: "local-only",
      subjectTruncated: false, descriptionTruncated: false, decorationsTruncated: false, messageUnavailable: null,
    }));
    const history: HistoryPage = {
      repositoryId: restoredProject.path, snapshotToken: "first-selection", scope: { kind: "currentBranch" },
      branch: "main", headState: "branch", headCommit: versions[0].commit, upstream: null, versions,
      nextCursor: null, hasMore: false, shallow: false, warnings: [],
    };
    mockedInvoke.mockImplementation((command, args) => {
      const request = args as { commit?: string; filePath?: string } | undefined;
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve({
        ...cleanStatus, isClean: false, counts: { ...cleanStatus.counts, changed: 3, total: 3 },
        entries: files.map((file) => ({ ...file, isPrepared: false, hasUnpreparedChanges: true })),
      });
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_history_page") return Promise.resolve(history);
      if (command === "read_saved_version_detail") return Promise.resolve({
        version: versions.find((version) => version.commit === request?.commit) ?? versions[0],
        comparisonBase: "empty-tree", comparisonIsEmptyTree: true, comparisonIsFirstParent: false,
        files, fileCounts: { changed: 3, new: 0, deleted: 0, renamed: 0, total: 3 }, filesTruncated: false, countsAreMinimum: false,
      });
      if (command === "read_file_diff" || command === "read_saved_version_file_diff") return Promise.resolve({
        kind: "binary", path: request?.filePath, originalPath: null, change: "changed",
      });
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve({
        ...branches, branches: branches.branches.map((branch) => ({ ...branch, isFinished: false })),
      });
      if (command === "get_branch_history") return Promise.resolve({
        name: (args as { name: string }).name, totalCount: 0, versions: [], hasMore: false, unpublished: null, route: null,
      });
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    const go = async (name: string): Promise<void> => {
      await user.click(screen.getByRole("combobox", { name: "Open command palette" }));
      await user.click(within(screen.getByRole("listbox", { name: "Command palette" })).getByText(name));
    };
    const firstFile = async (): Promise<void> => {
      await waitFor(() => expect(screen.getByRole("button", { name: /^src\/a\.ts/ })).toHaveAttribute("aria-current", "true"), { timeout: 5000 });
    };
    const selectedRootFile = (): void => {
      expect(screen.getByRole("button", { name: /^README\.md/ })).toHaveAttribute("aria-current", "true");
    };
    await go("Go to Changes");
    await firstFile();
    await user.click(screen.getByRole("button", { name: /^README\.md/ }));
    const changesFolder = screen.getByRole("button", { name: "src folder, 2 files" });
    await user.click(changesFolder);
    await go("Go to Changes");
    selectedRootFile();
    expect(changesFolder).toHaveAttribute("aria-expanded", "false");
    await go("Go to History");
    await firstFile();
    await user.click(screen.getByRole("treeitem", { name: /Older version/ }));
    await user.click(screen.getByRole("button", { name: /^README\.md/ }));
    const timeline = screen.getByRole("tree", { name: "Saved versions timeline" });
    timeline.scrollTop = 800;
    fireEvent.scroll(timeline);
    await go("Go to History");
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    selectedRootFile();
    expect(timeline.scrollTop).toBe(800);
    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(within(nav).getByRole("button", { name: "Work" }));
    selectedRootFile();
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tree", { name: "Saved versions timeline" })).toBe(timeline);
    expect(timeline.scrollTop).toBe(800);
    await user.click(screen.getByRole("tab", { name: "Changes" }));
    selectedRootFile();
    expect(changesFolder).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("tab", { name: "History" }));
    selectedRootFile();
    expect(screen.getByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    expect(timeline.scrollTop).toBe(800);
    // A targeted link still overrides the retained older version.
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(await screen.findByRole("button", { name: /Open “Newest version” in History/ }));
    expect(await screen.findByRole("treeitem", { name: /Newest version/ })).toHaveAttribute("aria-selected", "true");
    await firstFile();
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(await screen.findByRole("button", { name: /Open “Older version” in History/ }));
    expect(await screen.findByRole("treeitem", { name: /Older version/ })).toHaveAttribute("aria-selected", "true");
    await user.click(within(nav).getByRole("button", { name: "Branches" }));
    // Like firstFile above, allow the lazy screen and deferred project snapshot
    // to settle under the parallel suite; the default findBy budget is only 1s.
    const selectedBranch = await screen.findByRole("treeitem", { name: /feature\/spike/ }, { timeout: 5000 });
    await user.click(selectedBranch);
    expect(selectedBranch).toHaveAttribute("aria-selected", "true");
    await user.click(within(nav).getByRole("button", { name: "Overview" }));
    await user.click(within(nav).getByRole("button", { name: "Branches" }));
    expect(screen.getByRole("treeitem", { name: /feature\/spike/ })).toBe(selectedBranch);
    expect(selectedBranch).toHaveAttribute("aria-selected", "true");
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "read_history_page")).toHaveLength(1);
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1);
    // This exercises two lazy panels and several full app navigations under
    // the parallel suite; the normal 5s budget is for a single interaction.
  }, 20_000);

  it("keeps a screen mounted when you navigate away from it and back", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));
    // Work opens on Changes: the tab pair heads the list panel and the
    // screen's one heading names the tab that is showing.
    const changesScreen = (
      await screen.findByRole("heading", { name: "Changes" }, { timeout: 5000 })
    ).closest(".workbench");
    expect(changesScreen).not.toBeNull();
    // The tabs are on screen from the first frame, in the loading shell; the
    // panel itself is its own chunk and arrives behind them.
    expect(screen.getByRole("tab", { name: "Changes" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(document.querySelector(".changes-view")).not.toBeNull(), { timeout: 5000 });
    expect(mockedInvoke.mock.calls.some(([command]) => command === "read_working_tree_diffs")).toBe(false);

    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));

    // Still in the DOM, but hidden: no role query can reach it, so it is out
    // of the tab order and out of the accessibility tree while Overview is
    // the screen the user is on.
    expect(document.querySelector(".workbench")).toBe(changesScreen);
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    expect(changesScreen?.closest(".screen-slot")).toHaveAttribute("hidden");

    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));

    // The regression this guards (task 021): the screens used to be a ternary
    // chain, so every visit rebuilt this subtree from scratch — including the
    // diff virtualizer, whose rows measure themselves on first render. Node
    // identity is the evidence that the screen was revealed, not remounted.
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
    expect(document.querySelector(".workbench")).toBe(changesScreen);

    // The tabs switch views inside the screen without a navigation: History
    // takes the heading, Changes stays mounted but hidden and inert, and the
    // way back through the rail lands on the tab that was left open.
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    // The tabs never leave the screen, not even while History's chunk loads.
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    // The history port is not mocked here, so the panel lands in its error
    // state — still inside the tab's slot, still under the same tabs. That
    // state answers the project-activation read, which is deferred to idle (a
    // one-second timer under jsdom) and can still be ahead of the test here.
    // Waiting for the panel alone let the tab clicks below race it: the read's
    // loading and error renders rebuild the timeline header, so a click that
    // straddled them landed on a detached tab and did nothing.
    expect(await screen.findByRole("heading", { name: "Couldn't read history" }, { timeout: 5000 })).toBeInTheDocument();
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "read_history_page")).toHaveLength(1);
    expect(document.querySelector(".history-screen")?.closest(".workbench__view")).not.toHaveAttribute("hidden");
    expect(document.querySelector(".changes-view")?.closest(".workbench__view")).toHaveAttribute("hidden");
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Work" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();

    await waitFor(() =>
      expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1),
    );
    await userEvent.click(within(nav).getByRole("button", { name: "Branches" }));
    expect(await screen.findByRole("heading", { name: "Branches" })).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Branches" }));

    // Screen navigation consumes the cached snapshot. Freshness comes from
    // project activation and repository-watch invalidation, not from arrival.
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_branches")).toHaveLength(1);
    // Three lazy chunks are fetched cold here — both Work tabs and Branches.
  }, 15000);

  it("closing the active project goes Home without moving into another open project", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-confirm-close-project", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path, secondProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") {
        return Promise.resolve(invokedPath(args) === secondProject.path ? secondProject : restoredProject);
      }
      if (command === "close_project_session") return Promise.resolve();
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    await user.click(screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }));
    await user.click(screen.getByRole("button", { name: `Close ${restoredProject.name}` }));

    // Home, with no project active: the other one is still open, but the
    // reader picks it rather than being moved into it.
    expect(await screen.findByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: secondProject.name })).toBeNull();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBeNull();
  });

  it("rejects an old branch response after the same project is closed and reopened", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-confirm-close-project", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedOpenFolderDialog.mockResolvedValue(restoredProject.path);

    const staleBranches = {
      ...branches,
      branches: [
        ...branches.branches,
        {
          name: "stale/old-session",
          tip: {
            commit: "old789",
            shortCommit: "old789a",
            subject: "old session",
            committedAt: "2026-06-01T00:00:00Z",
          },
          isActive: false,
          upstream: null,
          isRetainedElsewhere: false,
          isFinished: false,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    const freshBranches = {
      ...branches,
      branches: [
        ...branches.branches,
        {
          name: "fresh/reopened-session",
          tip: {
            commit: "new789",
            shortCommit: "new789a",
            subject: "new session",
            committedAt: "2026-08-01T00:00:00Z",
          },
          isActive: false,
          upstream: null,
          isRetainedElsewhere: false,
          isFinished: false,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    let resolveOldRequest: ((snapshot: typeof staleBranches) => void) | undefined;
    let resolveNewRequest: ((snapshot: typeof freshBranches) => void) | undefined;
    let branchesCallCount = 0;
    let openCallCount = 0;

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        openCallCount += 1;
        return Promise.resolve({
          ...restoredProject,
          sessionEpoch: openCallCount === 1 ? "old-epoch" : "new-epoch",
        });
      }
      if (command === "close_project_session") {
        return Promise.resolve();
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        branchesCallCount += 1;
        return branchesCallCount === 1
          ? new Promise<typeof staleBranches>((resolve) => {
              resolveOldRequest = resolve;
            })
          : new Promise<typeof freshBranches>((resolve) => {
              resolveNewRequest = resolve;
            });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(
      () =>
        expect(
          mockedInvoke.mock.calls.filter(([command]) => command === "get_branches"),
        ).toHaveLength(1),
      { timeout: 3000 },
    );

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }),
    );
    await userEvent.click(screen.getByRole("button", { name: `Close ${restoredProject.name}` }));
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("close_project_session", {
        path: restoredProject.path,
        sessionEpoch: "old-epoch",
      }),
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Open a project" })[0]);

    await waitFor(
      () =>
        expect(
          mockedInvoke.mock.calls.filter(([command]) => command === "get_branches"),
        ).toHaveLength(2),
      { timeout: 3000 },
    );

    resolveOldRequest?.(staleBranches);
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Project navigation" })).getByRole("button", {
        name: "Branches",
      }),
    );
    // By title: Branches quiets a name's prefix in a span of its own, and the
    // full name is the row's title.
    expect(screen.queryAllByTitle("stale/old-session")).toHaveLength(0);

    resolveNewRequest?.(freshBranches);
    expect(await screen.findAllByTitle("fresh/reopened-session")).not.toHaveLength(0);
    expect(screen.queryAllByTitle("stale/old-session")).toHaveLength(0);
  });

  it("reopens the status bar's branch menu from cache, with no spinner", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    // The branch is switched from the status bar; Overview's header names
    // where the project lives instead.
    const trigger = screen.getByRole("button", { name: "Change branch (main)" });

    await userEvent.click(trigger);
    expect(await screen.findByRole("button", { name: "feature/spike" })).toBeInTheDocument();
    await userEvent.click(trigger);

    // The regression this guards: the menu used to refetch on every open and
    // blank itself to a spinner while it waited (task 019).
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "feature/spike" })).toBeInTheDocument();
  });

  it("names where the project lives in Overview's header once the project is active", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "read_remote_home") {
        return Promise.resolve({ remote: "origin", provider: "github", label: "acme/app", hasWebPage: true });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    // Read on activation, not only after a config change: it must not stay
    // a loading shape.
    expect(await screen.findByRole("button", { name: "Open acme/app on GitHub" })).toBeInTheDocument();
  });

  it("replaces Overview's switch dialog instead of stacking a second one on top", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "plan_switch_branch") {
        // Blocked by unsaved work: this is the state that offers the two
        // hand-offs ("Save version" / "New branch with these changes"),
        // and both used to leave this dialog mounted behind whatever they
        // opened next.
        return Promise.reject({
          code: "dirty_working_tree",
          message: "There are unsaved changes.",
          remediation: null,
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await userEvent.click(within(screen.getByRole("contentinfo", { name: "Project status" })).getByRole(
      "button",
      { name: "Change branch (main)" },
    ));
    await userEvent.click(await screen.findByRole("button", { name: "feature/spike" }));

    await userEvent.click(await screen.findByRole("radio", { name: /Take them to a new branch/ }));
    await userEvent.click(screen.getByRole("button", { name: "New branch with these changes" }));

    // Exactly one dialog: the create dialog replaced the switch dialog
    // rather than rendering on top of it. Both are owned by App state, so
    // nothing else closes the first one.
    // Exactly one: the switch dialog dismisses itself before handing off, so
    // the create dialog replaces it instead of stacking on top. Both are
    // owned by App state, so nothing else would close the first one.
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
  });

  it("visits Home with a project open, preserves its status through Back and Forward, and filters recents", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    localStorage.setItem("gitodile-recent-projects", JSON.stringify({
      version: 1,
      entries: [
        { path: restoredProject.path, name: restoredProject.name },
        { path: secondProject.path, name: secondProject.name },
      ],
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Home" }));
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Project navigation" })).queryByRole("button", { current: "page" })).toBeNull();
    expect(screen.getByRole("button", { name: secondProject.name })).toBeInTheDocument();
    // The open project stays in Home's list and says so (task 184).
    const openRow = screen.getByRole("button", { name: restoredProject.name });
    expect(within(openRow).getByText("Open now")).toBeInTheDocument();
    expect(openRow.closest(".home-launcher__item")).toHaveClass("home-launcher__item--active");
    // Home ends in its own status line (ADR 0032): no project strip, and the
    // palette deploys from the field in that branch instead.
    expect(screen.queryByRole("contentinfo", { name: "Project status" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "This computer" })).getByRole("combobox", { name: "Open command palette" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBe(restoredProject.path);

    await user.click(screen.getAllByRole("button", { name: "Go back" })[0]);
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    // Back on the project, the strip is the sheet's foot again, its status kept.
    const statusBar = screen.getByRole("contentinfo", { name: "Project status" });
    expect(within(statusBar).getByText(restoredProject.name)).toBeInTheDocument();
    expect(within(statusBar).getByText("main")).toBeInTheDocument();
    expect(within(statusBar).getByText("Everything is saved")).toBeInTheDocument();
    expect(await within(statusBar).findByText("Up to date")).toBeInTheDocument();
    await user.click(within(statusBar).getByRole("button", { name: "Check remote project changes" }));
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("check_team_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
    });
    await user.click(screen.getAllByRole("button", { name: "Go forward" })[0]);
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(document.querySelector(".home-launcher .gitodile-mascot")).toHaveClass("gitodile-mascot--blink");
    expect(document.querySelector(".home-launcher .gitodile-mascot")).not.toHaveClass("gitodile-mascot--enter");
    // The project is still open and active on Home: Back returns to it.
    await user.click(screen.getAllByRole("button", { name: "Go back" })[0]);
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Home" }));
    await user.click(screen.getAllByRole("button", { name: "Work" })[0]);
    expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Project status" })).getByText(restoredProject.name)).toBeInTheDocument();
  });

  it("offers Home from the palette while a project is open", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    await user.click(screen.getByRole("combobox", { name: "Open command palette" }));
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    expect(within(palette).getAllByRole("option")[0]).toHaveTextContent("Go to Home");
    expect(within(palette).getByText("Go to Home")).toBeInTheDocument();
    await user.click(within(palette).getByText("Go to Home"));
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
  });

  it("runs the search from the field: filtering, Enter, and an idle field after Escape", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    const field = screen.getByRole("combobox", { name: "Open command palette" });

    await user.click(field);
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // Escape stays on the screen, so the results fold back into the field.
    expect(screen.getByRole("listbox", { name: "Command palette" }).parentElement).toHaveClass("palette-panel--closing");
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
    // The field keeps the focus after Escape, so Enter must not run the first
    // command the cleared query leaves behind (it would open Home).
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).toBeNull();

    await user.click(field);
    await user.type(field, "home");
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    // The strip's search keeps the app's raised card, not the Console pane.
    expect(palette.parentElement).not.toHaveClass("palette-panel--console");
    const options = within(palette).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Go to Home");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    // A destination changes the screen, so the results go at once rather than
    // folding back while Home draws.
    expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("hands the palette to the Console's own field, keys included", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_console_settings") return Promise.resolve({ confirmChanges: true });
      if (command === "read_console_host") return Promise.reject(new Error("no host"));
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    const nav = screen.getByRole("navigation", { name: "Project navigation" });
    await user.click(within(nav).getByRole("button", { name: "Console" }));

    // Console replaces the strip; its status line owns the search now.
    const field = await screen.findByRole("combobox", { name: "Open command palette" }, { timeout: 5000 });
    expect(screen.queryByRole("contentinfo", { name: "Project status" })).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    const consolePalette = await screen.findByRole("listbox", { name: "Command palette" });
    expect(consolePalette).toBeInTheDocument();
    // The Console's field opens the results as a terminal pane.
    expect(consolePalette.parentElement).toHaveClass("palette-panel--console");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
    // The keyboard goes back to the Console prompt, so the next command can be
    // typed at once; Ctrl+K reaches the search again.
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    expect(prompt).toHaveFocus();
    // Choosing Console itself also hands the keyboard to the prompt, even
    // though the search field lives inside the same screen.
    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    await user.type(field, "go to console");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(prompt).toHaveFocus());
    // And a destination on another screen takes the focus too.
    await user.keyboard("{Control>}k{/Control}");
    expect(field).toHaveFocus();
    await user.type(field, "overview");
    const options = within(screen.getByRole("listbox", { name: "Command palette" })).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Go to Overview");
    await user.keyboard("{Enter}");
    const overviewHeading = await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() => expect(overviewHeading).toHaveFocus());
  });

  it("moves the focus to the screen a palette destination opens", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    const field = screen.getByRole("combobox", { name: "Open command palette" });
    await user.click(field);
    await user.type(field, "work");
    await user.keyboard("{Enter}");

    // The search no longer keeps the keyboard: the screen's active tab does.
    const tab = await screen.findByRole("tab", { name: "Changes" }, { timeout: 5000 });
    await waitFor(() => expect(tab).toHaveFocus(), { timeout: 5000 });
  });

  it("keeps a project open when a recent project fails to open from Inicio", async () => {
    localStorage.setItem("gitodile-language", "es");
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    localStorage.setItem("gitodile-recent-projects", JSON.stringify({
      version: 1, entries: [{ path: secondProject.path, name: secondProject.name }],
    }));
    let rejectRecent!: (reason: unknown) => void;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") {
        return invokedPath(args) === secondProject.path
          ? new Promise((_resolve, reject) => { rejectRecent = reject; })
          : Promise.resolve(restoredProject);
      }
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(screen.getByRole("menuitem", { name: "Inicio" }));
    expect(screen.getByRole("heading", { level: 1, name: /^Buen/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: secondProject.name }));
    expect(screen.getByRole("button", { name: "Abriendo…" })).toBeDisabled();
    rejectRecent({ code: "repository_not_found", message: "Folder moved.", remediation: null });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /^Buen/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBe(restoredProject.path);
  });
});
