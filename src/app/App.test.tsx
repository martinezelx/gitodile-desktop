import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import { TitlebarMenu } from "./TitlebarMenu";
import { ProjectPath } from "../features/overview";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
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
};

const freshBehindTeamSync: TeamSyncStatus = {
  ...cachedTeamSync,
  state: "behind",
  remoteCommit: "2222222222222222222222222222222222222222",
  behind: 1,
  knowledge: "fresh",
  checkedAt: 1,
  nextActions: ["reviewAndGet"],
  stateToken: "fresh-behind",
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
  incomingVersions: [{
    commit: "2222222222222222222222222222222222222222",
    shortCommit: "2222222",
    title: "Team version",
    description: null,
    committedAt: "2026-08-16T10:00:00Z",
    author: "Team",
  }],
  versionsTruncated: false,
  fileImpact: {
    totalCount: 1,
    counts: { added: 1, modified: 0, deleted: 0, renamed: 0, binary: 0 },
    files: [{ path: "team.txt", originalPath: null, category: "added", binary: false }],
    isTruncated: false,
  },
  consequences: [],
  risks: [],
  steps: [],
  verification: "verified",
  recovery: {
    reference: "refs/gitodrile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
  guarantees: {
    fastForwardOnly: true,
    noMerge: true,
    noRebase: true,
    noStash: true,
    noForce: true,
    noAutomaticConflictResolution: true,
  },
};

const getTeamResult: GetTeamChangesResult = {
  outcome: "completed",
  projectId: restoredProject.path,
  sessionEpoch: restoredProject.sessionEpoch,
  branch: "main",
  target: getTeamPlan.target,
  trackingRef: getTeamPlan.trackingRef,
  previousCommit: getTeamPlan.localCommit,
  resultingCommit: getTeamPlan.remoteCommit,
  observedHead: getTeamPlan.remoteCommit,
  receivedCount: 1,
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

const versionLines = {
  branch: "main",
  headState: "branch" as const,
  currentCommit: "abc123",
  lines: [
    {
      name: "main",
      tip: { commit: "abc123", shortCommit: "abc123a", subject: "first", committedAt: "2026-07-01T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      uniqueCommitCount: null,
      worktreePath: null,
    },
    {
      name: "feature/spike",
      tip: { commit: "def456", shortCommit: "def456a", subject: "wip", committedAt: "2026-07-02T00:00:00Z" },
      isActive: false,
      upstream: null,
      isRetainedElsewhere: true,
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
});

describe("TitlebarMenu", () => {
  function renderMenu(overrides: Partial<React.ComponentProps<typeof TitlebarMenu>> = {}) {
    const props: React.ComponentProps<typeof TitlebarMenu> = {
      onOpenAbout: vi.fn(),
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onCloneProject: vi.fn(),
      onCloseProject: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenShortcuts: vi.fn(),
      hasProject: true,
      isOpeningProject: false,
      canReloadWindow: true,
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

  it("offers provider-neutral cloning from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCloneProject = vi.fn();
    renderMenu({ onCloneProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clone remote project" }));

    expect(onCloneProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers local project creation from the titlebar menu", async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    renderMenu({ onCreateProject });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Create local project" }));

    expect(onCreateProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps reload focusable but unavailable while an operation is unsettled", async () => {
    const user = userEvent.setup();
    renderMenu({ canReloadWindow: false });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const reload = screen.getByRole("menuitem", { name: /Reload window.*Finish the current project operation/ });
    expect(reload).toHaveAttribute("aria-disabled", "true");
    await user.click(reload);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("ProjectPath", () => {
  it("reports clipboard permission failures through the caller's error surface", async () => {
    const user = userEvent.setup();
    const onCopyError = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(
      <LanguageProvider>
        <ProjectPath path="C:\\project" onCopyError={onCopyError} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Copy project path" }));

    expect(onCopyError).toHaveBeenCalledOnce();
  });
});

describe("App project restoration", () => {
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
    expect(screen.getByRole("dialog", { name: "Clone a remote project" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "Clone a remote project");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Clone a remote project" })).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "Create a local project" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Parent folder")).toHaveFocus());
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
    await user.click(await screen.findByRole("button", { name: "Turn this folder into a project" }));
    expect(screen.getByRole("dialog", { name: "Create a local project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Existing ordinary folder")).toHaveValue("C:\\ordinary folder");
  });

  it("opens Settings as a sectioned dialog without replacing the active screen", async () => {
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
    const login = screen.getByRole("button", { name: "Sign in — Coming soon" });
    expect(login).toHaveAttribute("aria-disabled", "true");
    expect(login).toHaveAttribute("data-tooltip", "Sign in — Coming soon");
    expect(screen.getByRole("heading", { name: "No project open" })).toBeInTheDocument();
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    // Synchronous on purpose: the panel is eager, so the dialog and its content
    // land in the same commit. Making the overlay lazy again would fail here
    // before it could reach the user as a fallback frame.
    expect(within(dialog).getByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Startup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No project open" })).toBeInTheDocument();
    // Focus lands on the section rail, not on Close: Enter right after opening
    // should not shut the dialog the user just asked for.
    await waitFor(() => expect(within(dialog).getByRole("tab", { name: "General" })).toHaveFocus());

    await user.click(within(dialog).getByRole("tab", { name: "Interface" }));
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
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    await user.keyboard("{Escape}");

    // A named palette entry still lands on its section rather than General.
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "Settings: Git");
    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole("tab", { name: /Git/ }),
    ).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: "Customize navigation bar" }));
    const navigationSettings = within(screen.getByRole("dialog", { name: "Settings" }));
    expect(navigationSettings.getByRole("tab", { name: "Navigation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(navigationSettings.getByRole("switch", { name: "Changes" }));
    await user.click(navigationSettings.getByRole("radio", { name: /Icons only/ }));
    await user.keyboard("{Escape}");

    const projectNavigation = screen.getByRole("navigation", { name: "Project navigation" });
    expect(projectNavigation).toHaveClass("rail-nav--icons-only");
    expect(within(projectNavigation).queryByRole("button", { name: "Changes" })).toBeNull();
    await user.click(within(projectNavigation).getByRole("button", { name: "More" }));
    expect(
      within(screen.getByRole("menu", { name: "More" })).getByText(
        "Changes — Open a project first",
      ),
    )
      .toBeInTheDocument();
  });

  it("re-reads the open project once when watching is turned back on", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    // Launched with watching off, so the restored project is as stale as
    // whatever happened on disk while the app was closed.
    localStorage.setItem("gitodrile-watch-projects", "false");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        return Promise.resolve(versionLines);
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
    await userEvent.click(screen.getByRole("switch", { name: "Watch open projects for changes" }));

    // Re-registering only catches what changes next, so turning it back on
    // has to close the gap itself — without the project being reopened.
    await waitFor(() => expect(statusReads).toBe(readsBeforeToggle + 1));
    expect(localStorage.getItem("gitodrile-watch-projects")).toBe("true");
  });

  it("animates a theme change by where it was asked for", async () => {
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

    // The titlebar toggle has one origin to sweep from; Settings does not.
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("tab", { name: "Interface" }));
    await user.click(within(dialog).getByRole("radio", { name: "Light" }));

    expect(modes).toEqual(["reveal", "fade"]);

    // Re-picking the option already in effect must not snapshot the window to
    // cross-fade it into an identical frame.
    await user.click(within(dialog).getByRole("radio", { name: "Light" }));
    expect(modes).toEqual(["reveal", "fade"]);

    Reflect.deleteProperty(document, "startViewTransition");
    delete document.documentElement.dataset.themeTransition;
  });

  it("does not overwrite stored projects before startup revalidation completes", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        // The idle-time branch-inventory prefetch (task 019). Answered here
        // so it stays a background no-op rather than an unexpected command.
        return Promise.resolve(versionLines);
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
    expect(JSON.parse(localStorage.getItem("gitodrile-projects") ?? "{}")).toEqual({
      version: 1,
      order: [restoredProject.path],
      activeId: restoredProject.path,
    });

    resolveOpen?.(restoredProject);
    expect(
      await screen.findByRole("heading", { name: restoredProject.name }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodrile-projects") ?? "{}")).toEqual({
        version: 1,
        order: [restoredProject.path],
        activeId: restoredProject.path,
      }),
    );
  });

  it("refreshes a project's local status whenever it becomes active", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        // The idle-time branch-inventory prefetch (task 019). Answered here
        // so it stays a background no-op rather than an unexpected command.
        return Promise.resolve(versionLines);
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
      screen.getByRole("button", { name: `${restoredProject.name} — switch project` }),
    );
    await userEvent.click(screen.getByRole("button", { name: secondProject.name }));

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

  it("commits a completed team update before one coordinated refresh without a watcher fetch", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        return Promise.resolve(versionLines);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });
    const overviewRefresh = await screen.findByRole("button", { name: "Refresh" });
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    const localReadsBeforeRefresh = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const repositoryOpensBeforeRefresh = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    await userEvent.click(overviewRefresh);
    await screen.findByText("1 newer team version is available");
    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status").length,
      ).toBeGreaterThan(localReadsBeforeRefresh),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status"),
    ).toHaveLength(localReadsBeforeRefresh + 1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "open_repository"),
    ).toHaveLength(repositoryOpensBeforeRefresh + 1);
    await userEvent.click(await screen.findByRole("button", { name: "Review and get" }));
    // The confirmation opens behind an async plan call, which under a loaded
    // parallel run needs more than the one-second default (task 072).
    const confirm = await screen.findByRole(
      "button",
      { name: "Get these versions" },
      { timeout: 3000 },
    );
    // The rail keeps switching and closing behind one trigger, so blocking
    // the switcher blocks both.
    expect(
      screen.getByRole("button", { name: `${restoredProject.name} — switch project` }),
    ).toHaveAttribute("aria-disabled", "true");

    const readsBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const opensBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    await userEvent.click(confirm);
    await screen.findByRole("heading", { name: "Team changes are now included" });

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

  it("keeps a screen mounted when you navigate away from it and back", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        return Promise.resolve(versionLines);
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
    await userEvent.click(within(nav).getByRole("button", { name: "Changes" }));
    const changesScreen = (
      await screen.findByRole("heading", { name: "Changes" }, { timeout: 5000 })
    ).closest(".changes-view");
    expect(changesScreen).not.toBeNull();
    expect(mockedInvoke.mock.calls.some(([command]) => command === "read_working_tree_diffs")).toBe(false);

    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));

    // Still in the DOM, but hidden: no role query can reach it, so it is out
    // of the tab order and out of the accessibility tree while Overview is
    // the screen the user is on.
    expect(document.querySelector(".changes-view")).toBe(changesScreen);
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    expect(changesScreen?.closest(".screen-slot")).toHaveAttribute("hidden");

    await userEvent.click(within(nav).getByRole("button", { name: "Changes" }));

    // The regression this guards (task 021): the screens used to be a ternary
    // chain, so every visit rebuilt this subtree from scratch — including the
    // diff virtualizer, whose rows measure themselves on first render. Node
    // identity is the evidence that the screen was revealed, not remounted.
    expect(await screen.findByRole("heading", { name: "Changes" })).toBeInTheDocument();
    expect(document.querySelector(".changes-view")).toBe(changesScreen);

    await waitFor(() =>
      expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_version_lines")).toHaveLength(1),
    );
    await userEvent.click(within(nav).getByRole("button", { name: "Lines" }));
    expect(await screen.findByRole("heading", { name: "Lines" })).toBeInTheDocument();
    await userEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(nav).getByRole("button", { name: "Lines" }));

    // Screen navigation consumes the cached snapshot. Freshness comes from
    // project activation and repository-watch invalidation, not from arrival.
    expect(mockedInvoke.mock.calls.filter(([command]) => command === "get_version_lines")).toHaveLength(1);
  });

  it("rejects an old branch response after the same project is closed and reopened", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem("gitodrile-confirm-close-project", "false");
    localStorage.setItem(
      "gitodrile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedOpenFolderDialog.mockResolvedValue(restoredProject.path);

    const staleVersionLines = {
      ...versionLines,
      lines: [
        ...versionLines.lines,
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
          isRetainedElsewhere: true,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    const freshVersionLines = {
      ...versionLines,
      lines: [
        ...versionLines.lines,
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
          isRetainedElsewhere: true,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    let resolveOldRequest: ((snapshot: typeof staleVersionLines) => void) | undefined;
    let resolveNewRequest: ((snapshot: typeof freshVersionLines) => void) | undefined;
    let versionLinesCallCount = 0;
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
      if (command === "get_version_lines") {
        versionLinesCallCount += 1;
        return versionLinesCallCount === 1
          ? new Promise<typeof staleVersionLines>((resolve) => {
              resolveOldRequest = resolve;
            })
          : new Promise<typeof freshVersionLines>((resolve) => {
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
          mockedInvoke.mock.calls.filter(([command]) => command === "get_version_lines"),
        ).toHaveLength(1),
      { timeout: 3000 },
    );

    await userEvent.click(
      screen.getByRole("button", { name: `${restoredProject.name} — switch project` }),
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
          mockedInvoke.mock.calls.filter(([command]) => command === "get_version_lines"),
        ).toHaveLength(2),
      { timeout: 3000 },
    );

    resolveOldRequest?.(staleVersionLines);
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Project navigation" })).getByRole("button", {
        name: "Lines",
      }),
    );
    expect(screen.queryByText("stale/old-session")).toBeNull();

    resolveNewRequest?.(freshVersionLines);
    expect(await screen.findAllByText("fresh/reopened-session")).not.toHaveLength(0);
    expect(screen.queryAllByText("stale/old-session")).toHaveLength(0);
  });

  it("reopens Overview's version-line menu from cache, with no spinner", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        return Promise.resolve(versionLines);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    const trigger = screen.getByRole("button", { name: "Change (main)" });

    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /feature\/spike/ })).toBeInTheDocument();
    await userEvent.click(trigger);

    // The regression this guards: the menu used to refetch on every open and
    // blank itself to a spinner while it waited (task 019).
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /feature\/spike/ })).toBeInTheDocument();
  });

  it("replaces Overview's switch dialog instead of stacking a second one on top", async () => {
    localStorage.setItem("gitodrile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodrile-projects",
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
      if (command === "get_version_lines") {
        return Promise.resolve(versionLines);
      }
      if (command === "plan_switch_version_line") {
        // Blocked by unsaved work: this is the state that offers the two
        // hand-offs ("Save version" / "New version line with this work"),
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
    await userEvent.click(screen.getByRole("button", { name: "Change (main)" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /feature\/spike/ }));

    const createWithWork = await screen.findByRole("button", {
      name: "New version line with this work",
    });
    await userEvent.click(createWithWork);

    // Exactly one dialog: the create dialog replaced the switch dialog
    // rather than rendering on top of it. Both are owned by App state, so
    // nothing else closes the first one.
    // Exactly one: the switch dialog dismisses itself before handing off, so
    // the create dialog replaces it instead of stacking on top. Both are
    // owned by App state, so nothing else would close the first one.
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
  });
});
