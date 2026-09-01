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
    project: { branch: "feature/a-very-long-version-line-name", headState: "branch" },
    workingTree: dirtyTree,
    workingTreeError: null,
    isCheckingChanges: false,
    versionLines,
    isLoadingVersionLines: false,
    teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus() },
    onSwitchVersionLine: vi.fn(),
    onSeeAllVersionLines: vi.fn(),
    onCheckTeamChanges: vi.fn(),
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
    const release = screen.getByRole("button", { name: "What's new in GitOdile v0.1.0 alpha" });
    expect(release).toHaveTextContent("v0.1.0alpha");
    await userEvent.click(release);
    expect(onOpenChangelog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Check remote project changes" })).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("shows real line, working-tree, remote, freshness, and refresh state", async () => {
    const onCheckTeamChanges = vi.fn();
    const onSwitchVersionLine = vi.fn();
    renderBar({ onCheckTeamChanges, onSwitchVersionLine });

    expect(screen.getByText("feature/a-very-long-version-line-name")).toBeInTheDocument();
    expect(screen.getByText("4 unsaved changes")).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByText(/Checked .*3 min/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", {
      name: "Change version line (feature/a-very-long-version-line-name)",
    }));
    await userEvent.click(screen.getByRole("button", { name: "feature/other" }));
    expect(onSwitchVersionLine).toHaveBeenCalledWith("feature/other");

    await userEvent.click(screen.getByRole("button", { name: "Check remote project changes" }));
    expect(onCheckTeamChanges).toHaveBeenCalledOnce();
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
          project={{ branch: "main", headState: "branch" }}
          workingTree={dirtyTree}
          workingTreeError={null}
          isCheckingChanges={false}
          versionLines={versionLines}
          isLoadingVersionLines={false}
          teamSync={{ ...EMPTY_TEAM_SYNC_STATE, status: cached }}
          onSwitchVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenChangelog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Local snapshot")).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <StatusBar
          project={{ branch: "main", headState: "branch" }}
          workingTree={dirtyTree}
          workingTreeError="status failed"
          isCheckingChanges={false}
          versionLines={versionLines}
          isLoadingVersionLines={false}
          teamSync={{ ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(), isStale: true }}
          onSwitchVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          onOpenChangelog={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Changes unavailable")).toBeInTheDocument();
    expect(screen.getByText("May be outdated")).toBeInTheDocument();
  });

  it("uses Spanish copy and locale-aware relative time", () => {
    localStorage.setItem("gitodile-language", "es");
    renderBar();

    expect(screen.getByText("4 cambios sin guardar")).toBeInTheDocument();
    expect(screen.getByText("Al día")).toBeInTheDocument();
    expect(screen.getByText(/Comprobado hace 3 min/)).toBeInTheDocument();
  });

  it("disables a remote check when the project is outside a version line", () => {
    renderBar({ project: { branch: null, headState: "detached" } });
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
});
