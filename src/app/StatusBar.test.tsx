import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import type { WorkingTreeStatus } from "../features/status";
import type { VersionLinesSnapshot } from "../features/version-lines";
import {
  EMPTY_TEAM_SYNC_STATE,
  type TeamSyncState,
  type TeamSyncStatus,
  type TeamSyncViewState,
} from "../features/sync";
import type { UpdateCandidate } from "../features/app-updates";
import { formatRelativeCheckTime, StatusBar, type StatusBarProps } from "./StatusBar";

const dirtyTree: WorkingTreeStatus = {
  isClean: false,
  counts: { changed: 2, new: 1, deleted: 1, renamed: 0, conflicted: 0, total: 4 },
  lineTotals: { added: 12, removed: 3 },
  entries: [],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: true,
  upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
};

const versionLines: VersionLinesSnapshot = {
  branch: "feature/a-very-long-version-line-name",
  headState: "branch",
  currentCommit: "1111111111111111111111111111111111111111",
  lines: [
    {
      name: "feature/a-very-long-version-line-name",
      tip: {
        commit: "1111111111111111111111111111111111111111",
        shortCommit: "1111111",
        subject: "Current work",
        committedAt: "2026-08-28T10:00:00Z",
      },
      isActive: true,
      upstream: "origin/feature/a-very-long-version-line-name",
      isRetainedElsewhere: true,
      uniqueCommitCount: null,
      worktreePath: null,
      upstreamAhead: 0,
      upstreamBehind: 0,
      upstreamGone: false,
      isDefault: false,
    },
    {
      name: "feature/other",
      tip: {
        commit: "2222222222222222222222222222222222222222",
        shortCommit: "2222222",
        subject: "Other work",
        committedAt: "2026-08-27T10:00:00Z",
      },
      isActive: false,
      upstream: null,
      isRetainedElsewhere: false,
      uniqueCommitCount: 1,
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
};

function syncStatus(state: TeamSyncState = "upToDate"): TeamSyncStatus {
  return {
    state,
    localBranch: "main",
    localCommit: "1111111111111111111111111111111111111111",
    upstreamRemote: "origin",
    destinationBranch: "main",
    trackingRef: "refs/remotes/origin/main",
    remoteCommit: "1111111111111111111111111111111111111111",
    ahead: state === "ahead" || state === "diverged" ? 2 : 0,
    behind: state === "behind" || state === "diverged" ? 3 : 0,
    knowledge: "fresh",
    checkedAt: Date.now() - 3 * 60_000,
    warnings: [],
    nextActions: ["checkAgain"],
    stateToken: `status-${state}`,
    forecast: null,
  };
}

function renderBar(overrides: Partial<StatusBarProps> = {}): ReturnType<typeof render> {
  const props = {
    project: { name: "gitodile", branch: "feature/a-very-long-version-line-name", headState: "branch" },
    workingTree: dirtyTree,
    workingTreeError: null,
    isCheckingChanges: false,
    versionLines,
    isLoadingVersionLines: false,
    teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus() },
    onSwitchVersionLine: vi.fn(),
    versionLineCreate: {
      projectPath: "/repo",
      sessionEpoch: "epoch-1",
      onOperationStart: vi.fn(() => true),
      onOperationFinish: vi.fn(),
      onOperationPhaseChange: vi.fn(),
      onCreated: vi.fn(),
    },
    onSeeAllVersionLines: vi.fn(),
    onCheckTeamChanges: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onPublish: vi.fn(),
    onGetChanges: vi.fn(),
    onGetAndPublish: vi.fn(),
    onOpenChangelog: vi.fn(),
    ...overrides,
  } as StatusBarProps;
  return render(<LanguageProvider><StatusBar {...props} /></LanguageProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => cleanup());

describe("StatusBar", () => {
  describe("release tag", () => {
    const candidate: UpdateCandidate = {
      candidateId: "c1", version: "9.9.9", target: "windows-x86_64",
      publishedAt: null, notes: "", highlights: [], expectedBytes: null,
    };

    it("stays the version and the changelog while there is nothing to do", async () => {
      const onOpenChangelog = vi.fn();
      const onOpenAppUpdate = vi.fn();
      renderBar({ appUpdate: { kind: "current", checkedAt: "2026-10-01T00:00:00Z" }, onOpenChangelog, onOpenAppUpdate });

      const release = screen.getByRole("button", { name: `What's new in GitOdile ${__APP_VERSION__}` });
      expect(release).toHaveClass("status-bar__release--quiet");
      expect(release).toHaveTextContent(__APP_VERSION__);
      await userEvent.click(release);
      expect(onOpenChangelog).toHaveBeenCalledOnce();
      expect(onOpenAppUpdate).not.toHaveBeenCalled();
    });

    it("names a new version in About's words and leads to the update dialog", async () => {
      const onOpenChangelog = vi.fn();
      const onOpenAppUpdate = vi.fn();
      renderBar({ appUpdate: { kind: "available", candidate }, onOpenChangelog, onOpenAppUpdate });

      const release = screen.getByRole("button", { name: "New version: 9.9.9 · Open updates" });
      expect(release).toHaveClass("status-bar__release--action");
      expect(release).toHaveTextContent("New version: 9.9.9");
      await userEvent.click(release);
      expect(onOpenAppUpdate).toHaveBeenCalledOnce();
      expect(onOpenChangelog).not.toHaveBeenCalled();
    });

    it("asks for the restart once the download is ready", () => {
      renderBar({ appUpdate: { kind: "ready", candidate }, onOpenAppUpdate: vi.fn() });

      const release = screen.getByRole("button", { name: "Ready to install · New version: 9.9.9" });
      expect(release).toHaveTextContent("Ready to install");
    });

    it("keeps the version while downloading and puts the progress in the tooltip", () => {
      renderBar({
        appUpdate: { kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 42, totalBytes: 100 } },
        onOpenAppUpdate: vi.fn(),
      });

      const release = screen.getByRole("button", { name: `${__APP_VERSION__} · Downloading 9.9.9 · 42%` });
      expect(release).toHaveAttribute("data-tooltip", "Downloading 9.9.9 · 42%");
      expect(release).toHaveTextContent(__APP_VERSION__);
    });

    it("never reports more than the whole download", () => {
      renderBar({
        appUpdate: { kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 120, totalBytes: 100 } },
        onOpenAppUpdate: vi.fn(),
      });

      expect(screen.getByRole("button", { name: /Downloading 9\.9\.9 · 100%$/ })).toBeInTheDocument();
    });

    it("keeps a build without updates looking at rest", () => {
      renderBar({ appUpdate: { kind: "unavailable", error: { code: "not_configured", stage: "check", retryable: false } } });

      const release = screen.getByRole("button", { name: `What's new in GitOdile ${__APP_VERSION__} · Updates unavailable` });
      expect(release).toHaveClass("status-bar__release--quiet");
    });

    it("marks unseen release notes until the changelog is opened", () => {
      renderBar({ appUpdate: { kind: "current", checkedAt: "2026-10-01T00:00:00Z" }, hasUnseenWhatsNew: true });

      expect(
        screen.getByRole("button", { name: `Updated to ${__APP_VERSION__} · See what's new` }),
      ).toHaveTextContent(__APP_VERSION__);
    });

    it("lets an action outrank unseen notes", () => {
      renderBar({ appUpdate: { kind: "available", candidate }, hasUnseenWhatsNew: true, onOpenAppUpdate: vi.fn() });

      expect(screen.getByRole("button", { name: "New version: 9.9.9 · Open updates" })).toBeInTheDocument();
    });
  });

  it("renders honest no-project state and opens the changelog", async () => {
    const onOpenChangelog = vi.fn();
    renderBar({
      project: null,
      workingTree: null,
      teamSync: EMPTY_TEAM_SYNC_STATE,
      onOpenChangelog,
    });

    expect(screen.getByText("No project open")).toBeInTheDocument();
    const release = screen.getByRole("button", { name: `What's new in GitOdile ${__APP_VERSION__}` });
    expect(release).toHaveTextContent(__APP_VERSION__);
    await userEvent.click(release);
    expect(onOpenChangelog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Check remote project changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Settings for/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("opens the active project's settings from its name, right before the version line", async () => {
    const onOpenProjectSettings = vi.fn();
    const onPrefetchProjectSettings = vi.fn();
    renderBar({ onOpenProjectSettings, onPrefetchProjectSettings });

    const button = screen.getByRole("button", { name: "Settings for gitodile" });
    expect(button).toHaveClass("status-bar__project");
    expect(button).toHaveTextContent("gitodile");
    expect(button).toHaveAttribute("data-tooltip", "Project: gitodile · Project settings");
    // "project / line": only the slash stands between the two facts.
    expect(button.nextElementSibling).toHaveClass("status-bar__separator");
    expect(button.nextElementSibling?.nextElementSibling).toHaveClass("version-lines-quick-switch");
    await userEvent.hover(button);
    button.focus();
    expect(onPrefetchProjectSettings).toHaveBeenCalled();
    await userEvent.click(button);
    expect(onOpenProjectSettings).toHaveBeenCalledOnce();
  });

  it("shows real line, working-tree, remote, freshness, and refresh state", async () => {
    const onCheckTeamChanges = vi.fn();
    const onSwitchVersionLine = vi.fn();
    renderBar({ onCheckTeamChanges, onSwitchVersionLine });

    expect(screen.getByText("feature/a-very-long-version-line-name")).toBeInTheDocument();
    // Unsaved work is a dot after the line's name; the sentence is the
    // trigger's tooltip and the screen reader's.
    const trigger = screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    });
    expect(trigger.querySelector(".version-line-selector__marker--unsaved")).not.toBeNull();
    expect(trigger).toHaveAttribute("title", "feature/a-very-long-version-line-name · 4 unsaved changes");
    expect(screen.getByText("4 unsaved changes")).toHaveClass("visually-hidden");
    // "Up to date" is said by the cloud and its age; the word stays for the
    // screen reader, and how it is known lives in the tooltip.
    const sync = screen.getByText("Up to date").closest(".status-bar__sync");
    expect(screen.getByText("Up to date")).toHaveClass("visually-hidden");
    expect(sync).toHaveClass("status-bar__sync--success");
    expect(sync).toHaveAttribute("data-tooltip", expect.stringMatching(/^Up to date · Checked .*3 min/));

    await userEvent.click(screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    }));
    await userEvent.click(screen.getByRole("button", { name: "feature/other" }));
    expect(onSwitchVersionLine).toHaveBeenCalledWith("feature/other");

    await userEvent.click(screen.getByRole("button", { name: "Check remote project changes" }));
    expect(onCheckTeamChanges).toHaveBeenCalledOnce();
  });

  it("draws no dot on a clean tree and never the line totals", () => {
    const { unmount } = renderBar({ workingTree: { ...dirtyTree, isClean: true, lineTotals: null } });
    expect(document.querySelector(".version-line-selector__marker")).toBeNull();
    expect(screen.getByText("Everything is saved")).toHaveClass("visually-hidden");
    unmount();

    renderBar();
    expect(screen.queryByText("+12")).toBeNull();
    expect(screen.queryByText("−3")).toBeNull();
  });

  it.each([
    ["ahead", "Publish 2 versions"],
    ["behind", "Get 3 versions"],
    ["diverged", "Get and publish"],
    ["noRemote", "No remote connected"],
    ["noUpstream", "No publish destination"],
    ["unborn", "Save a version to compare"],
    ["detached", "Switch lines to compare"],
    ["unknown", "Sync status unavailable"],
  ] satisfies Array<[TeamSyncState, string]>) ("maps %s without falling back to an optimistic state", (state, label) => {
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(state) } });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["ahead", "Publish 2 versions", "onPublish", "publish"],
    ["behind", "Get 3 versions", "onGetChanges", "get"],
    ["diverged", "Get and publish", "onGetAndPublish", "getAndPublish"],
  ] as const)("turns the cloud into the %s sync action", async (state, name, handler, kind) => {
    const handlers = { onPublish: vi.fn(), onGetChanges: vi.fn(), onGetAndPublish: vi.fn() };
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(state) }, ...handlers });

    const cloud = screen.getByRole("button", { name });
    expect(cloud).toHaveClass(`status-bar__sync-action--${kind}`);
    expect(cloud).toHaveAttribute("data-tooltip", expect.stringMatching(new RegExp(`^${name} · Checked `)));
    await userEvent.click(cloud);
    expect(handlers[handler]).toHaveBeenCalledOnce();
    for (const [other, fn] of Object.entries(handlers)) {
      if (other !== handler) expect(fn).not.toHaveBeenCalled();
    }
    // The refresh beside it stays the explicit check.
    expect(screen.getByRole("button", { name: "Check remote project changes" })).toBeEnabled();
  });

  it("says how fresh an up-to-date answer is without hovering", () => {
    renderBar();
    const sync = screen.getByText("Up to date").closest(".status-bar__sync");
    expect(sync?.querySelector(".status-bar__sync-age")).toHaveTextContent(/3 min/);
  });

  it("keeps the cloud a plain fact when there is nothing to publish or the answer is doubted", () => {
    const { unmount } = renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("upToDate") } });
    expect(screen.queryByRole("button", { name: /^Publish / })).toBeNull();
    unmount();

    // A stale or failed answer may still say "ahead" or "behind", but it is
    // not a state to act from.
    const stale = renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("ahead"), isStale: true } });
    expect(screen.queryByRole("button", { name: /^Publish / })).toBeNull();
    stale.unmount();

    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("behind"), error: "offline" } });
    expect(screen.queryByRole("button", { name: /^Get / })).toBeNull();
  });

  it("distinguishes loading, failed, cached, and stale knowledge", () => {
    const { rerender } = renderBar({
      isCheckingChanges: true,
      teamSync: { ...EMPTY_TEAM_SYNC_STATE, isLoading: true, isCheckingRemote: true },
    });
    expect(screen.getByText("Checking changes…")).toBeInTheDocument();
    expect(document.querySelector(".version-line-selector__icon.icon--spinning")).not.toBeNull();
    expect(screen.getByText("Checking the remote…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking the remote…" })).toBeDisabled();

    const cached = { ...syncStatus(), knowledge: "cached" as const, checkedAt: null };
    rerender(
      <LanguageProvider>
        <StatusBar
          project={{ name: "gitodile", branch: "main", headState: "branch" }}
          workingTree={dirtyTree}
          workingTreeError={null}
          isCheckingChanges={false}
          versionLines={versionLines}
          isLoadingVersionLines={false}
          teamSync={{ ...EMPTY_TEAM_SYNC_STATE, status: cached }}
          onSwitchVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenProjectSettings={vi.fn()}
          onPublish={vi.fn()}
          onGetChanges={vi.fn()}
          onGetAndPublish={vi.fn()}
          onOpenChangelog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Up to date").closest(".status-bar__sync")).toHaveAttribute(
      "data-tooltip",
      expect.stringContaining("Local snapshot"),
    );

    rerender(
      <LanguageProvider>
        <StatusBar
          project={{ name: "gitodile", branch: "main", headState: "branch" }}
          workingTree={dirtyTree}
          workingTreeError="status failed"
          isCheckingChanges={false}
          versionLines={versionLines}
          isLoadingVersionLines={false}
          teamSync={{ ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(), isStale: true }}
          onSwitchVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenProjectSettings={vi.fn()}
          onPublish={vi.fn()}
          onGetChanges={vi.fn()}
          onGetAndPublish={vi.fn()}
          onOpenChangelog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Changes unavailable")).toBeInTheDocument();
    expect(document.querySelector(".version-line-selector__marker--error")).not.toBeNull();
    // Doubt takes the word; the last known state moves to the tooltip.
    const stale = screen.getByText("May be out of date").closest(".status-bar__sync");
    expect(stale).toHaveClass("status-bar__sync--warning");
    expect(stale).toHaveAttribute("data-tooltip", expect.stringContaining("Up to date"));
  });

  it("uses Spanish copy and locale-aware relative time", () => {
    localStorage.setItem("gitodile-language", "es");
    renderBar();

    expect(screen.getByText(/4 cambios sin guardar/)).toBeInTheDocument();
    expect(screen.getByText("Al día").closest(".status-bar__sync")).toHaveAttribute(
      "data-tooltip",
      expect.stringMatching(/Comprobado hace 3 min/),
    );
  });

  it("disables a remote check when the project is outside a version line", () => {
    renderBar({ project: { name: "gitodile", branch: null, headState: "detached" } });
    expect(screen.getByText("Specific saved version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change version line/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check remote project changes" })).toBeDisabled();
  });
});

describe("formatRelativeCheckTime", () => {
  it("clamps future timestamps and changes units as time passes", () => {
    const now = Date.UTC(2026, 7, 28, 12);
    expect(formatRelativeCheckTime(now + 5_000, now, "en", "just now")).toBe("just now");
    expect(formatRelativeCheckTime(now - 2 * 60 * 60_000, now, "en", "just now")).toMatch(/2 hr/);
    expect(formatRelativeCheckTime(now - 2 * 24 * 60 * 60_000, now, "es", "ahora mismo")).toMatch(/hace 2 d/);
  });

  it("states the working context — project, then line — and keeps the strip's height", () => {
    const { container } = renderBar();

    // The two facts are the sentence: no words in front of them. The
    // project's name comes first, so the strip still says which project this
    // is on every other screen.
    expect(screen.queryByText("Working on")).not.toBeInTheDocument();
    const project = screen.getByText("gitodile").closest(".status-bar__project");
    expect(project).not.toBeNull();
    // The custom tooltip carries the full name, the same way every other item
    // reveals what it had to truncate.
    expect(project).toHaveAttribute("data-tooltip", "Project: gitodile · Project settings");
    expect(
      screen.getByRole("button", { name: "Change version line (feature/a-very-long-version-line-name)" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".status-bar")).not.toBeNull();
  });

  it("puts creating a line and managing them on one row, and hands each to its own flow", async () => {
    const onSeeAllVersionLines = vi.fn();
    renderBar({ onSeeAllVersionLines });

    const trigger = screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Switch version line" });
    const footer = dialog.querySelector(".version-lines-quick-switch__footer");
    const newLine = screen.getByRole("button", { name: "New line" });
    const manage = screen.getByRole("button", { name: "Manage lines" });

    // One row, both actions in it, in reading order.
    expect(footer).not.toBeNull();
    expect(footer).toContainElement(newLine);
    expect(footer).toContainElement(manage);
    expect(newLine.compareDocumentPosition(manage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // A new line is named right in the popup, the composer taking the
    // footer's place; cancelling puts the footer back.
    await userEvent.click(newLine);
    expect(screen.getByRole("textbox", { name: "New line name" })).toBeInTheDocument();
    expect(dialog.querySelector(".version-lines-quick-switch__footer")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Manage lines" }));
    expect(onSeeAllVersionLines).toHaveBeenCalledOnce();
  });

  it("closes the quick switch on Escape and gives focus back to the strip", async () => {
    renderBar();
    const trigger = screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Switch version line" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
