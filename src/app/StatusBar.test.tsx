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
    onCreateVersionLine: vi.fn(),
    onSeeAllVersionLines: vi.fn(),
    onCheckTeamChanges: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onPublish: vi.fn(),
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
  it("renders honest no-project state and opens the changelog", async () => {
    const onOpenChangelog = vi.fn();
    renderBar({
      project: null,
      workingTree: null,
      teamSync: EMPTY_TEAM_SYNC_STATE,
      onOpenChangelog,
    });

    expect(screen.getByText("No project open")).toBeInTheDocument();
    const release = screen.getByRole("button", { name: `What's new in GitOdile v${__APP_VERSION__} preview` });
    // The version already names the channel; a preview adds a glyph, not the word again.
    expect(release.textContent).toBe(`v${__APP_VERSION__}`);
    expect(release.querySelector(".channel-glyph")).not.toBeNull();
    await userEvent.click(release);
    expect(onOpenChangelog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Check remote project changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Settings for/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("opens the active project's settings between its name and version line", async () => {
    const onOpenProjectSettings = vi.fn();
    const onPrefetchProjectSettings = vi.fn();
    renderBar({ onOpenProjectSettings, onPrefetchProjectSettings });

    const button = screen.getByRole("button", { name: "Settings for gitodile" });
    expect(button).toHaveAttribute("data-tooltip", "Project settings");
    expect(button.previousElementSibling).toHaveClass("status-bar__project");
    expect(button.nextElementSibling).toHaveClass("version-lines-quick-switch");
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
    // The working tree is the switcher's own mark: a count riding the icon,
    // with the sentence kept for the tooltip and the screen reader, and the
    // added/removed line totals as a quieter second fact beside it.
    const changes = screen.getByText(/4 unsaved changes/).closest(".status-bar__changes");
    expect(changes).toHaveAttribute("data-tooltip", "4 unsaved changes · 12 lines added, 3 lines removed");
    expect(changes?.querySelector(".status-bar__changes-count")).toHaveTextContent("4");
    expect(changes?.querySelector(".status-bar__diff-stat--added")).toHaveTextContent("+12");
    expect(changes?.querySelector(".status-bar__diff-stat--removed")).toHaveTextContent("−3");
    // The remote fact is one word; how it is known lives in its tooltip.
    const sync = screen.getByText("Up to date").closest(".status-bar__sync");
    expect(sync).toHaveClass("status-bar__sync--success");
    expect(sync).toHaveAttribute("data-tooltip", expect.stringMatching(/Checked .*3 min/));

    await userEvent.click(screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    }));
    await userEvent.click(screen.getByRole("button", { name: "feature/other" }));
    expect(onSwitchVersionLine).toHaveBeenCalledWith("feature/other");

    await userEvent.click(screen.getByRole("button", { name: "Check remote project changes" }));
    expect(onCheckTeamChanges).toHaveBeenCalledOnce();
  });

  it("hides the line totals when they are unknown or nothing moved", () => {
    const { unmount } = renderBar({ workingTree: { ...dirtyTree, lineTotals: null } });
    expect(document.querySelector(".status-bar__diff-stats")).toBeNull();
    unmount();

    renderBar({ workingTree: { ...dirtyTree, lineTotals: { added: 0, removed: 0 } } });
    expect(document.querySelector(".status-bar__diff-stats")).toBeNull();
  });

  it("names only the side of the line totals that moved", () => {
    renderBar({ workingTree: { ...dirtyTree, lineTotals: { added: 5, removed: 0 } } });
    const changes = screen.getByText(/4 unsaved changes/).closest(".status-bar__changes");
    expect(changes).toHaveAttribute("data-tooltip", "4 unsaved changes · 5 lines added");
    expect(changes?.querySelector(".status-bar__diff-stat--added")).toHaveTextContent("+5");
    expect(changes?.querySelector(".status-bar__diff-stat--removed")).toHaveTextContent("−0");
  });

  it.each([
    ["ahead", "2 versions to publish"],
    ["behind", "3 project versions available"],
    ["diverged", "Both sides changed"],
    ["noRemote", "No remote connected"],
    ["noUpstream", "No publish destination"],
    ["unborn", "Save a version to compare"],
    ["detached", "Switch lines to compare"],
    ["unknown", "Project sync unavailable"],
  ] satisfies Array<[TeamSyncState, string]>) ("maps %s without falling back to an optimistic state", (state, label) => {
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(state) } });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("opens publish from the cloud when saved versions are ready to send", async () => {
    const onPublish = vi.fn();
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("ahead") }, onPublish });

    const cloud = screen.getByRole("button", { name: "Publish 2 versions" });
    expect(cloud).toHaveAttribute("data-tooltip", expect.stringMatching(/^Publish 2 versions · Checked /));
    await userEvent.click(cloud);
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("keeps the cloud a plain fact when there is nothing to publish or the answer is doubted", () => {
    const { unmount } = renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("upToDate") } });
    expect(screen.queryByRole("button", { name: /^Publish / })).toBeNull();
    unmount();

    // A stale answer may still say "ahead", but it is not a state to act from.
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("ahead"), isStale: true } });
    expect(screen.queryByRole("button", { name: /^Publish / })).toBeNull();
  });

  it("distinguishes loading, failed, cached, and stale knowledge", () => {
    const { rerender } = renderBar({
      isCheckingChanges: true,
      teamSync: { ...EMPTY_TEAM_SYNC_STATE, isLoading: true, isCheckingRemote: true },
    });
    expect(screen.getByText("Checking changes…")).toBeInTheDocument();
    expect(screen.getByText("Checking project changes…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking project changes…" })).toBeDisabled();

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
          onCreateVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenProjectSettings={vi.fn()}
          onPublish={vi.fn()}
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
          onCreateVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenProjectSettings={vi.fn()}
          onPublish={vi.fn()}
          onOpenChangelog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Changes unavailable").closest(".status-bar__changes")).toHaveClass("status-bar__changes--error");
    // Doubt takes the word; the last known state moves to the tooltip.
    const stale = screen.getByText("May be outdated").closest(".status-bar__sync");
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
    expect(project).toHaveAttribute("data-tooltip", "Project: gitodile");
    expect(
      screen.getByRole("button", { name: "Change version line (feature/a-very-long-version-line-name)" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".status-bar")).not.toBeNull();
  });

  it("puts creating a line and managing them on one row, and hands each to its own flow", async () => {
    const onCreateVersionLine = vi.fn();
    const onSeeAllVersionLines = vi.fn();
    renderBar({ onCreateVersionLine, onSeeAllVersionLines });

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

    await userEvent.click(newLine);
    expect(onCreateVersionLine).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(trigger);
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
