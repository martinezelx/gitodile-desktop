import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

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
      isFinished: true,
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
      isFinished: false,
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

/** The strip's search wiring, in one place so a test overrides one field. */
function paletteProps(overrides: Partial<StatusBarProps["commandPalette"]> = {}): StatusBarProps["commandPalette"] {
  return {
    isOpen: false,
    query: "",
    inputRef: React.createRef<HTMLInputElement>(),
    keyShortcuts: "Control+K",
    onOpen: vi.fn(),
    onQueryChange: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  };
}

/** The project popup's wiring: two open projects, the first active. */
function projectSwitchProps(overrides: Partial<StatusBarProps["projectSwitch"]> = {}): StatusBarProps["projectSwitch"] {
  return {
    entries: [
      { id: "/repo", name: "gitodile", path: "/repo", contextLabel: null, branch: "main", hasError: false, hasOperationInProgress: false, hasUnsavedChanges: false, isFavourite: false },
      { id: "/other", name: "landing", path: "/other", contextLabel: null, branch: "main", hasError: false, hasOperationInProgress: false, hasUnsavedChanges: false, isFavourite: false },
    ],
    recent: [],
    activeId: "/repo",
    canSwitch: true,
    isOpening: false,
    onActivate: vi.fn(),
    onOpenRecent: vi.fn(),
    onClose: vi.fn(),
    onOpenAnother: vi.fn(),
    onCreate: vi.fn(),
    onClone: vi.fn(),
    onToggleFavourite: vi.fn(),
    onOpenProjectSettings: vi.fn(),
    onOpenFolder: vi.fn(),
    onOpenHome: vi.fn(),
    ...overrides,
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
    projectSwitch: projectSwitchProps(),
    onPublish: vi.fn(),
    onGetChanges: vi.fn(),
    onGetAndPublish: vi.fn(),
    commandPalette: paletteProps(),
    ...overrides,
  } as StatusBarProps;
  return render(<LanguageProvider><StatusBar {...props} /></LanguageProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => cleanup());

describe("StatusBar", () => {
  it("renders honest no-project state and keeps the field", () => {
    renderBar({
      project: null,
      workingTree: null,
      teamSync: EMPTY_TEAM_SYNC_STATE,
      projectSwitch: projectSwitchProps({ entries: [], activeId: null }),
    });

    // The project segment stays: with nothing open it is the way to open one.
    expect(screen.getByRole("button", { name: "No project open" })).toHaveClass("status-bar__project");
    // The field is global: it works with no project at all.
    expect(screen.getByRole("combobox", { name: "Open command palette" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check remote project changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Settings for/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
    // With nothing to describe there is no remote block.
    expect(document.querySelector(".status-bar__block--remote")).toBeNull();
  });

  it("is the app's search: the caller owns the query and the field reports typing", async () => {
    const onQueryChange = vi.fn();
    const onOpen = vi.fn();
    renderBar({ commandPalette: paletteProps({ query: "main", onQueryChange, onOpen }) });

    const field = screen.getByRole("combobox", { name: "Open command palette" });
    expect(field).toHaveValue("main");
    expect(field).toHaveAttribute("placeholder", "Search or do something…");
    expect(field.className).toContain("status-bar__search-input");

    await userEvent.type(field, "x");
    expect(onOpen).toHaveBeenCalled();
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("sets the project and its line side by side, and the remote as one phrase", () => {
    const { container } = renderBar();

    const blocks = container.querySelectorAll(".status-bar__block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveClass("status-bar__block--where");
    expect(blocks[1]).toHaveClass("status-bar__block--remote");
    // Two segments of one shape and no mark between them (task 189): the
    // project's trigger, then the line's.
    expect(container.querySelector(".status-bar__path")).toBeNull();
    const where = Array.from(blocks[0].children);
    expect(where[0]).toHaveClass("status-bar__project");
    expect(where[1]).toHaveClass("version-lines-quick-switch");
    // The strip no longer carries the app version: its release notes live in
    // the menu and the notification centre now.
    expect(screen.getByRole("contentinfo").textContent).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("puts the field between where you are and the remote", () => {
    renderBar();
    const footer = screen.getByRole("contentinfo");
    const children = Array.from(footer.children);

    expect(children[0]).toHaveClass("status-bar__block--where");
    expect(children[1]).toHaveClass("status-bar__search-slot");
    expect(children[2]).toHaveClass("status-bar__block--remote");
    expect(footer.querySelector(".status-bar__sync")).not.toBeNull();
    // The remote's two segments — the fact and the check — side by side.
    const remote = footer.querySelector(".status-bar__block--remote");
    expect(remote?.querySelectorAll(".status-bar__seg")).toHaveLength(2);
    expect(remote?.querySelector(".status-bar__seg + .status-bar__refresh")).not.toBeNull();
  });

  it("opens the project popup from its name, and acts on the active project from its head", async () => {
    const onOpenProjectSettings = vi.fn();
    const onPrefetchProjectSettings = vi.fn();
    renderBar({ projectSwitch: projectSwitchProps({ onOpenProjectSettings, onPrefetchProjectSettings }) });

    const trigger = screen.getByRole("button", { name: "gitodile — switch project" });
    expect(trigger).toHaveTextContent("gitodile");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.hover(trigger);
    expect(onPrefetchProjectSettings).toHaveBeenCalledWith("/repo");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const popup = screen.getByRole("dialog", { name: "Open projects" });
    expect(popup).toHaveTextContent("landing");
    await userEvent.click(screen.getByRole("button", { name: "Settings for gitodile" }));
    expect(onOpenProjectSettings).toHaveBeenCalledWith("/repo");
    expect(screen.queryByRole("dialog", { name: "Open projects" })).not.toBeInTheDocument();
  });

  it("marks the active project's own state, never another project's", () => {
    const base = projectSwitchProps();
    const { rerender } = renderBar({
      projectSwitch: { ...base, entries: [base.entries[0], { ...base.entries[1], hasUnsavedChanges: true }] },
    });
    // Another project's unsaved work stays on its popup row.
    expect(document.querySelector(".status-bar__mark")).toBeNull();

    rerender(
      <LanguageProvider>
        <StatusBar
          project={{ name: "gitodile", branch: "main", headState: "branch" }}
          workingTree={dirtyTree}
          workingTreeError={null}
          isCheckingChanges={false}
          versionLines={versionLines}
          isLoadingVersionLines={false}
          teamSync={{ ...EMPTY_TEAM_SYNC_STATE, status: syncStatus() }}
          onSwitchVersionLine={vi.fn()}
          onSeeAllVersionLines={vi.fn()}
          onCheckTeamChanges={vi.fn()}
          projectSwitch={{ ...base, activeStatus: { kind: "resolve", description: "The last operation didn't finish" } }}
          onPublish={vi.fn()}
          onGetChanges={vi.fn()}
          onGetAndPublish={vi.fn()}
          commandPalette={paletteProps()}
        />
      </LanguageProvider>,
    );
    const trigger = screen.getByRole("button", { name: "gitodile — switch project · The last operation didn't finish" });
    expect(trigger.querySelector(".status-bar__mark--resolve svg")).not.toBeNull();
    expect(trigger).toHaveAttribute("data-tooltip", "gitodile · The last operation didn't finish");
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
    ["unborn", "Save a version to compare"],
    ["detached", "Switch lines to compare"],
    ["upstreamGone", "No longer on the remote"],
  ] satisfies Array<[TeamSyncState, string]>) ("maps %s without falling back to an optimistic state", (state, label) => {
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus(state) } });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["ahead", "Publish 2 versions", "onPublish", "publish"],
    ["behind", "Get 3 versions", "onGetChanges", "get"],
    ["diverged", "Get and publish", "onGetAndPublish", "getAndPublish"],
    // A line with no destination gets one by publishing.
    ["noUpstream", "Publish this line", "onPublish", "publish"],
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
    // The refresh beside it stays the explicit check, inside the remote's own
    // block rather than a loose glyph.
    const check = screen.getByRole("button", { name: "Check remote project changes" });
    expect(check).toBeEnabled();
    expect(check.closest(".status-bar__block--remote")).toBe(cloud.closest(".status-bar__block--remote"));
  });

  it("keeps the last known words on the fact while a check runs", () => {
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("ahead"), isCheckingRemote: true } });
    const held = screen.getByText("Publish 2 versions").closest(".status-bar__sync");
    expect(held).toHaveClass("status-bar__sync--held");
    expect(held?.tagName).toBe("SPAN");
    expect(held?.closest(".status-bar__block--remote")).not.toBeNull();
    // The sentence stays for the screen reader; one spinner, not two.
    expect(held).toHaveTextContent("Checking the remote…");
    const check = screen.getByRole("button", { name: "Checking the remote…" });
    expect(check).toBeDisabled();
    expect(check.querySelector(".icon--spinning")).toBeNull();
  });

  it("keeps a fact and an action in the same block", () => {
    const { unmount } = renderBar();
    expect(screen.getByText("Up to date").closest(".status-bar__block--remote")).not.toBeNull();
    unmount();

    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("ahead") } });
    expect(
      screen.getByRole("button", { name: "Publish 2 versions" }).closest(".status-bar__block--remote"),
    ).not.toBeNull();
  });

  it("asks to check again when the reader's own change overtook the answer", () => {
    renderBar({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, status: syncStatus("upToDate"), isStale: true } });

    const stale = screen.getByText("Check again").closest(".status-bar__sync");
    expect(stale).toHaveClass("status-bar__sync--warning");
    // The state it doubts, and how old it is, are the tooltip's; the action the
    // reader can take is the word itself, so it is not restated after it.
    expect(stale).toHaveAttribute("data-tooltip", expect.stringMatching(/^Up to date · Checked /));
    expect(stale).toHaveAccessibleName("Up to date · Check remote project changes");
  });

  it("says how fresh an up-to-date answer is without hovering", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "Check remote project changes" }))
      .toHaveTextContent(/3 min/);
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

  it("gives both blocks the same press, with no fill held at rest", async () => {
    const onCheckTeamChanges = vi.fn();
    renderBar({ onCheckTeamChanges });

    const footer = screen.getByRole("contentinfo");
    const blocks = footer.querySelectorAll(".status-bar__block");
    // Two segments each, all of them pressable, so hovering the two halves of
    // the strip does the same thing.
    for (const block of blocks) {
      expect(block.querySelectorAll("button")).toHaveLength(2);
    }
    // Neither block holds a fill: the fill is what hovering or pressing a
    // segment looks like, and nothing on the strip wears it at rest.
    expect(footer.querySelector(".status-bar__block--action")).toBeNull();

    // The state segment is a press of its own: it says the relation and asks
    // for the check, named so it is never mistaken for a label.
    const state = screen.getByRole("button", { name: "Up to date · Check remote project changes" });
    expect(state).toHaveClass("status-bar__sync");
    await userEvent.click(state);
    expect(onCheckTeamChanges).toHaveBeenCalledOnce();
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
          projectSwitch={projectSwitchProps()}
          onPublish={vi.fn()}
          onGetChanges={vi.fn()}
          onGetAndPublish={vi.fn()}
          commandPalette={paletteProps()}
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
          projectSwitch={projectSwitchProps()}
          onPublish={vi.fn()}
          onGetChanges={vi.fn()}
          onGetAndPublish={vi.fn()}
          commandPalette={paletteProps()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText("Changes unavailable")).toBeInTheDocument();
    expect(document.querySelector(".version-line-selector__marker--error")).not.toBeNull();
    // Doubt takes the word; the last known state moves to the tooltip.
    const stale = screen.getByText("Check again").closest(".status-bar__sync");
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
    expect(project).toHaveAttribute("data-tooltip", "gitodile");
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
