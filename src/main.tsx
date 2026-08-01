import React, { Suspense, lazy, useEffect, useReducer, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  LayoutDashboard,
  GitCompare,
  GitCommitHorizontal,
  LifeBuoy,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Moon,
  Monitor,
  FolderOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Copy,
  Square,
  Check,
  X,
  RefreshCw,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  CircleAlert,
  TriangleAlert,
  FileDiff,
  Send,
} from "lucide-react";
import { LANGUAGE_NAMES, LanguageProvider, useLanguage, type Language, type LanguagePreference } from "./i18n";
import {
  getRepositoryOverviewState,
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  type ChangeCategory,
  type RepositoryInfo,
  type WorkingTreeStatus,
} from "./repositoryOverview";
import { localizeAppError } from "./appError";
import { autoHideScrollbarProps } from "./autoHideScrollbar";
import { createDiffCache, releaseDiffCache } from "./diffCache";
import type { PendingVersionsResult } from "./publish";
import type { VersionLine, VersionLinesSnapshot } from "./versionLines";
import { useModalFocus } from "./modalFocus";
import {
  EMPTY_CHANGES_SELECTION,
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  initialProjectSessionsState,
  projectSessionsReducer,
  projectSessionsStateToStored,
  readStoredProjects,
  shouldRefreshOnWatchEvent,
  writeStoredProjects,
  type ProjectView,
} from "./projectSessions";
import {
  ProjectSwitcher,
  ProjectSwitcherCompact,
  ProjectSwitcherIcons,
  type ProjectSwitcherEntry,
} from "./projectSwitcher";
import "./styles.css";

// Lazily loaded: none of these are needed for the first paint (the Overview
// screen with no project open), and ChangesPanel/PublishDialog/PendingVersions
// pull in the file-type icon set (~70 SVGs). Deferring them keeps the initial
// bundle — and therefore first-paint time — small.
const ChangesPanel = lazy(() => import("./changes").then((m) => ({ default: m.ChangesPanel })));
const PublishDialog = lazy(() => import("./publishDialog").then((m) => ({ default: m.PublishDialog })));
const PendingVersionsSection = lazy(() =>
  import("./pendingVersions").then((m) => ({ default: m.PendingVersionsSection })),
);
const VersionLinesPanel = lazy(() =>
  import("./versionLinesPanel").then((m) => ({ default: m.VersionLinesPanel })),
);
const CreateVersionLineDialog = lazy(() =>
  import("./versionLinesDialog").then((m) => ({ default: m.CreateVersionLineDialog })),
);
const SwitchVersionLineDialog = lazy(() =>
  import("./versionLinesDialog").then((m) => ({ default: m.SwitchVersionLineDialog })),
);

type ThemePreference = "system" | "light" | "dark";
type View = ProjectView | "settings";

type GitDiagnostics = {
  state: "available" | "missing" | "unusable" | "check_failed";
  version: string | null;
};
type GitInstallationResult = {
  outcome: "started" | "guidance" | "already_starting" | "failed";
  platform: "windows" | "macos" | "linux" | "unsupported";
  guidanceUrl: string | null;
};
type GitUpdateStatus = {
  state: "checking" | "unavailable" | "up_to_date" | "update_available" | "failed" | "timed_out";
  cached: boolean;
};
type GitUpdateLaunchResult = {
  outcome: "started" | "already_starting" | "unavailable" | "failed";
};
type GitIdentity = { name: string | null; email: string | null };

const THEME_STORAGE_KEY = "gitodrile-theme";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";
const APP_VERSION = "0.1.0";

function repositoryStatus(project: RepositoryInfo, t: ReturnType<typeof useLanguage>["t"]): string {
  if (project.headState === "detached") {
    return project.kind === "worktree" ? t.overviewWorktreeDetached : t.overviewRepositoryDetached;
  }
  if (project.headState === "unborn") {
    return project.kind === "worktree"
      ? t.overviewWorktreeUnborn(project.branch ?? "")
      : t.overviewRepositoryUnborn(project.branch ?? "");
  }
  return project.kind === "worktree"
    ? t.overviewWorktreeBranch(project.branch ?? "")
    : t.overviewRepositoryBranch(project.branch ?? "");
}

function readStoredBoolean(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultValue : stored === "true";
}

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(theme: ThemePreference): void {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function useTheme(): [ThemePreference, (theme: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

function resolveEffectiveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_ICONS: Record<ThemePreference, React.JSX.Element> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGE_ORDER: LanguagePreference[] = ["system", "en", "es"];

const NAV_ICONS = {
  overview: <LayoutDashboard />,
  changes: <GitCompare />,
  versionLines: <GitBranch />,
  history: <GitCommitHorizontal />,
  recovery: <LifeBuoy />,
  settings: <Settings2 />,
  collapse: <PanelLeftClose />,
  expand: <PanelLeftOpen />,
} as const;

const SEARCH_ICON = <Search />;

const CROCODILE_MARK = (
  <span className="gitodrile-mark" aria-hidden="true" />
);

/** Suspense fallback for a lazily-loaded view (see `ChangesPanel` below).
 * Only ever visible on the first navigation into that view before its chunk
 * has been fetched — normally masked entirely by the idle-time prefetch in
 * `main.tsx`. */
function ViewLoadingFallback(): React.JSX.Element {
  return (
    <div className="empty-state" aria-busy="true">
      <div className="empty-state__icon empty-state__icon--loading" aria-hidden="true">
        <LoaderCircle />
      </div>
    </div>
  );
}

/** Defers background work (chunk prefetches, speculative repository reads)
 * until the app is idle, so none of it competes with first paint or with a
 * user action already in flight — the rule task 018 established for launch
 * performance. Returns a canceller for use as an effect cleanup. */
function scheduleIdleTask(task: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  // Not `window.setTimeout`: the `in` check above narrows `window` itself, so
  // reaching for a member of it here is a type error. The global works.
  const handle = setTimeout(task, 1000);
  return () => clearTimeout(handle);
}

type Command = { id: string; label: string; hint?: string; action: () => void };

function CommandPalette({
  isOpen,
  onClose,
  commands,
}: {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const runCommand = (command: Command | undefined): void => {
    if (!command) {
      return;
    }
    command.action();
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(filtered[selectedIndex]);
    }
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.paletteAriaLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <span aria-hidden="true">{SEARCH_ICON}</span>
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[selectedIndex] ? `palette-option-${filtered[selectedIndex].id}` : undefined}
            aria-autocomplete="list"
            placeholder={t.palettePlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ul
          {...autoHideScrollbarProps<HTMLUListElement>()}
          className="palette-list auto-hide-scrollbar"
          id="palette-list"
          role="listbox"
        >
          {filtered.length === 0 && <li className="palette-empty">{t.paletteNoMatches}</li>}
          {filtered.map((command, index) => (
            <li
              key={command.id}
              id={`palette-option-${command.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              className="palette-item"
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                runCommand(command);
              }}
            >
              {command.label}
              {command.hint && <span className="palette-item__hint">{command.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Titlebar overflow menu. For now this only exposes Help → About, but the
 * pattern (button + popover, closing on Escape/outside click) mirrors
 * ProjectMenu so more sections can be added later without a rewrite.
 */
function TitlebarMenu({ onOpenAbout }: { onOpenAbout: () => void }): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="titlebar-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="titlebar-icon-button"
        type="button"
        aria-label={t.titlebarMoreActions}
        title={t.titlebarMoreActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Menu aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="titlebar-menu__list" role="menu" aria-label={t.titlebarMoreActions}>
          <div className="titlebar-menu__heading" aria-hidden="true">{t.titlebarHelpSection}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onOpenAbout();
            }}
          >
            {t.aboutGitOdrile}
          </button>
        </div>
      )}
    </div>
  );
}

const FOLDER_ICON = <FolderOpen />;

/**
 * Infrequent project-level actions. Uses a button + popover rather than
 * `<details>` so it closes on Escape and on an outside click, and exposes the
 * expanded state to assistive technology.
 */
function ProjectMenu({
  onOpenProject,
  onCloseProject,
  isOpening,
}: {
  onOpenProject: () => void;
  onCloseProject: () => void;
  isOpening: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="project-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="project-menu__trigger"
        type="button"
        aria-label={t.overviewProjectMenu}
        title={t.overviewProjectMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="project-menu__list" role="menu" aria-label={t.overviewProjectMenu}>
          <button
            type="button"
            role="menuitem"
            disabled={isOpening}
            onClick={() => {
              setIsOpen(false);
              onOpenProject();
            }}
          >
            {isOpening ? t.overviewOpening : t.overviewOpenAnotherProject}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onCloseProject();
            }}
          >
            {t.overviewCloseProject}
          </button>
        </div>
      )}
    </div>
  );
}

/** Truncated paths stay fully available: readable on hover/AT, and copyable. */
function ProjectPath({ path }: { path: string }): React.JSX.Element {
  const { t } = useLanguage();
  const [wasCopied, setWasCopied] = useState(false);

  useEffect(() => {
    if (!wasCopied) return;
    const timer = window.setTimeout(() => setWasCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [wasCopied]);

  const copyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path);
      setWasCopied(true);
    } catch {
      // Clipboard access can be denied; leave the visible path as the fallback.
    }
  };

  return (
    <p className="project-path">
      <span className="project-path__value" title={path}>
        {path}
      </span>
      <button
        className="project-path__copy"
        type="button"
        onClick={() => void copyPath()}
        aria-label={t.overviewCopyPath}
        title={wasCopied ? t.overviewPathCopied : t.overviewCopyPath}
      >
        {wasCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="visually-hidden" role="status">
        {wasCopied ? t.overviewPathCopied : ""}
      </span>
    </p>
  );
}

/**
 * Announces a *finished refresh* without moving focus. Deliberately stays empty
 * until a check has actually run and completed: mirroring the card's headline
 * from the first render would make a screen reader read the same status twice.
 */
function StatusAnnouncement({ isBusy, message }: { isBusy: boolean; message: string }): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (isBusy) {
      wasBusyRef.current = true;
      setAnnouncement("");
    } else if (wasBusyRef.current) {
      setAnnouncement(message);
    }
  }, [isBusy, message]);

  return (
    <span className="visually-hidden" role="status">
      {announcement}
    </span>
  );
}

const CATEGORY_LABEL_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof ReturnType<typeof useLanguage>["t"]>;

/** Overview's bounded quick-switch/quick-create entry point (task 016). A
 * deliberately small menu — the searchable full list stays on the
 * Version-lines screen (`onSeeAll`). It reads the project session's cached
 * branch inventory (task 019) instead of fetching its own copy on every
 * open, and asks for a background refresh when opened so the menu is both
 * instant and current. */
function OverviewVersionLineQuickActions({
  snapshot,
  isLoadingSnapshot,
  currentValue,
  canSwitch,
  variant = "default",
  onOpened,
  onSwitch,
  onCreate,
  onSeeAll,
}: {
  snapshot: VersionLinesSnapshot | null;
  /** Distinguishes "still reading, for the first time" from "read failed and
   * left nothing to show", which would otherwise both look like a menu stuck
   * on its spinner. */
  isLoadingSnapshot: boolean;
  /** The active branch name (or the detached/unborn placeholder text) —
   * shown as the selector's own trigger label, not a separate static value
   * next to a generic "Change" button. */
  currentValue: string;
  canSwitch: boolean;
  /** "spotlight" is the larger, more prominent styling used in Overview's
   * dedicated version-line section; "default" is the compact form other
   * callers can still use. */
  variant?: "default" | "spotlight";
  /** Fired each time the menu opens, so the caller can revalidate the shared
   * snapshot behind it. The menu never waits on that: it renders whatever is
   * cached and swaps in the newer answer if one arrives. */
  onOpened: () => void;
  onSwitch: (target: string) => void;
  onCreate: () => void;
  onSeeAll: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  // Bounded on purpose: this is the shortcut, not the inventory. Lines
  // checked out in another worktree are dropped because this window cannot
  // switch to them.
  const lines: VersionLine[] | null = snapshot
    ? snapshot.lines.filter((line) => !line.isActive && !line.worktreePath).slice(0, 6)
    : null;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonClassName = variant === "spotlight" ? "secondary-button secondary-button--large" : "secondary-button";

  useEffect(() => {
    if (isOpen) {
      onOpened();
    }
    // Only on the open transition: `onOpened` is a fresh closure every
    // render, so depending on it would re-request on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Moves focus into the open menu for keyboard/screen-reader users, and
  // gives Escape an explicit place to send focus back to (native outside-
  // click dismissal already leaves focus wherever the click landed, so that
  // path is left alone).
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => menuRef.current?.focus());
    const handlePointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <div className={`version-lines-quick-switch version-lines-quick-switch--${variant}`} ref={containerRef}>
      {canSwitch ? (
        <button
          ref={triggerRef}
          className="version-line-selector"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`${t.overviewChangeVersionLine} (${currentValue})`}
          onClick={() => setIsOpen((value) => !value)}
        >
          <span className="version-line-selector__value">{currentValue}</span>
          <ChevronDown aria-hidden="true" className="version-line-selector__chevron" />
        </button>
      ) : (
        <span className="version-line-selector version-line-selector--static">
          <span className="version-line-selector__value">{currentValue}</span>
        </span>
      )}
      <button className={buttonClassName} type="button" onClick={onCreate}>
        {t.overviewNewVersionLine}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="version-lines-quick-switch__menu"
          role="menu"
          aria-label={t.overviewQuickSwitchTitle}
          tabIndex={-1}
        >
          {lines === null && isLoadingSnapshot ? (
            <div className="version-lines-quick-switch__status" role="status">
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
            </div>
          ) : lines === null || lines.length === 0 ? (
            <p className="version-lines-quick-switch__empty">{t.overviewQuickSwitchEmpty}</p>
          ) : (
            lines.map((line) => (
              <button
                key={line.name}
                type="button"
                role="menuitem"
                className="version-lines-quick-switch__item"
                onClick={() => {
                  setIsOpen(false);
                  onSwitch(line.name);
                }}
              >
                {line.name}
              </button>
            ))
          )}
          <button
            type="button"
            className="version-lines-quick-switch__see-all"
            onClick={() => {
              setIsOpen(false);
              onSeeAll();
            }}
          >
            {t.overviewQuickSwitchSeeAll}
          </button>
        </div>
      )}
    </div>
  );
}

function OverviewPanel({
  project,
  isOpening,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onCheckChanges,
  onReviewChanges,
  onOpenProject,
  onCloseProject,
  canPublish,
  onPublish,
  onPublishUpTo,
  pendingVersions,
  pendingVersionsError,
  onRetryPendingVersions,
  versionLines,
  isLoadingVersionLines,
  onQuickSwitchOpened,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
}: {
  project: RepositoryInfo | null;
  /** Only ever drives the *empty*-state's own loading affordance below —
   * opening another project while one is already active must not make the
   * active project's own card look like it's the one being (re)opened. Its
   * failures are reported in a standalone dialog (see `openError` in
   * `App`), never merged into this project's own status. */
  isOpening: boolean;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  onCheckChanges: () => void;
  onReviewChanges: () => void;
  onOpenProject: () => void;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  onRetryPendingVersions: () => void;
  onCloseProject: () => void;
  /** The project session's cached branch inventory, shared with the Version
   * lines screen so Overview's quick-switch menu opens instantly instead of
   * reading branches again every time (task 019). */
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  onQuickSwitchOpened: () => void;
  canPublish: boolean;
  onPublish: () => void;
  onPublishUpTo: (commit: string) => void;
  onQuickSwitchVersionLine: (target: string) => void;
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  if (project) {
    const overview = getRepositoryOverviewState(project);
    const versionValue = overview.isDetached
      ? t.overviewSpecificSavedVersion
      : (overview.versionLine ?? t.overviewNoSavedVersions);

    // The working tree is only unknown before the first check has finished, so
    // the card never invents a count and never blanks out a known one while a
    // later refresh is running.
    const summary = workingTree ? getWorkingTreeSummary(workingTree) : null;
    const breakdown = workingTree ? getWorkingTreeBreakdown(workingTree) : [];
    const isLoading = isCheckingChanges && !workingTree;
    const errorMessage = workingTree ? null : workingTreeError;

    let heroStatus: "loading" | "error" | "success" | "attention" | "neutral";
    let heroHeadline: string;
    let heroMessage: string;
    if (isLoading) {
      heroStatus = "loading";
      heroHeadline = t.statusCheckingTitle;
      heroMessage = t.statusCheckingMessage;
    } else if (errorMessage) {
      heroStatus = "error";
      heroHeadline = t.statusCheckFailedTitle;
      heroMessage = errorMessage;
    } else if (summary) {
      heroStatus = summary.tone === "positive" ? "success" : summary.tone;
      if (summary.total === 0 && pendingVersions.totalCount > 0) {
        heroHeadline = t.overviewSavedAndReadyTitle;
        heroMessage = t.overviewSavedAndReadyMessage(pendingVersions.totalCount);
      } else {
        heroHeadline = t[summary.headlineKey];
        heroMessage =
          summary.conflicted > 0
            ? t.statusConflictsMessage(summary.conflicted)
            : summary.total === 0
              ? t.statusCleanMessage
              : t.statusChangesMessage(summary.total);
      }
    } else {
      // Reached only if a check has neither finished nor failed yet.
      heroStatus = "success";
      heroHeadline = t[overview.headlineKey];
      heroMessage = repositoryStatus(project, t);
    }

    return (
      <div className="project-overview" aria-busy={isCheckingChanges}>
        <header className="project-overview__header">
          <div className="project-overview__identity">
            <h1>{project.name}</h1>
          </div>
          <ProjectMenu onOpenProject={onOpenProject} onCloseProject={onCloseProject} isOpening={isOpening} />
        </header>

        <section
          className={`project-hero project-hero--${heroStatus}`}
          aria-labelledby="project-hero-heading"
        >
          <div className="project-hero__icon" aria-hidden="true">
            {isLoading ? (
              <LoaderCircle />
            ) : errorMessage ? (
              <CircleAlert />
            ) : heroStatus === "attention" ? (
              <TriangleAlert />
            ) : heroStatus === "neutral" ? (
              <FileDiff />
            ) : (
              <CheckCircle2 />
            )}
          </div>
          <div className="project-hero__content">
            <h2 id="project-hero-heading">{heroHeadline}</h2>
            {errorMessage && !isLoading ? (
              <p key="hero-error" role="alert">
                {heroMessage}
              </p>
            ) : (
              <p key="hero-message">{heroMessage}</p>
            )}
            {/* A refresh that fails after a successful one keeps the known
                status visible, but must still say the numbers are stale. */}
            {workingTree && workingTreeError && !isCheckingChanges && (
              <p className="project-hero__note" role="alert">
                {t.statusRefreshFailedNote}
              </p>
            )}
            {breakdown.length > 0 && (
              <ul className="status-breakdown" aria-label={t.statusBreakdownLabel}>
                {breakdown.map((item) => (
                  <li
                    key={item.category}
                    className={`status-breakdown__item${item.category === "conflicted" ? " status-breakdown__item--attention" : ""}`}
                  >
                    {t[CATEGORY_LABEL_KEYS[item.category]](item.count)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="project-hero__actions">
            {canPublish && (
              <button className="primary-button project-hero__action" type="button" onClick={onPublish}>
                <Send aria-hidden="true" />
                {t.overviewPublishChanges}
              </button>
            )}
            <button
              className={`${canPublish ? "secondary-button" : "primary-button"} project-hero__action`}
              type="button"
              onClick={onCheckChanges}
              disabled={isCheckingChanges}
            >
              <RefreshCw
                aria-hidden="true"
                className={isCheckingChanges ? "icon--spinning" : undefined}
              />
              {isCheckingChanges ? t.statusRefreshing : t.statusRefresh}
            </button>
            <button className="secondary-button project-hero__action" type="button" onClick={onReviewChanges}>
              {t.overviewReviewChanges}
            </button>
          </div>
          <StatusAnnouncement isBusy={isCheckingChanges} message={`${heroHeadline}. ${heroMessage}`} />
        </section>

        <section className="version-line-spotlight" aria-labelledby="version-line-spotlight-heading">
          <div className="version-line-spotlight__icon" aria-hidden="true">
            <GitBranch />
          </div>
          <div className="version-line-spotlight__body">
            <h2 id="version-line-spotlight-heading">{t.overviewCurrentVersionLine}</h2>
            {overview.isUnborn && <p className="version-line-spotlight__value">{versionValue}</p>}
            <p className="version-line-spotlight__description">{t[overview.versionDescriptionKey]}</p>
          </div>
          {!overview.isUnborn && (
            <OverviewVersionLineQuickActions
              snapshot={versionLines}
              isLoadingSnapshot={isLoadingVersionLines}
              currentValue={versionValue}
              canSwitch={!overview.isDetached}
              variant="spotlight"
              onOpened={onQuickSwitchOpened}
              onSwitch={onQuickSwitchVersionLine}
              onCreate={() => onQuickCreateVersionLine(overview.isDetached)}
              onSeeAll={onGoToVersionLines}
            />
          )}
        </section>

        {(pendingVersions.totalCount > 0 || pendingVersionsError) && project && (
          <Suspense fallback={null}>
            <PendingVersionsSection
              key={project.path}
              projectPath={project.path}
              result={pendingVersions}
              error={pendingVersionsError}
              onRetry={onRetryPendingVersions}
              onPublishUpTo={onPublishUpTo}
            />
          </Suspense>
        )}

        <section className="project-facts" aria-labelledby="project-facts-heading">
          <h2 className="project-facts__title" id="project-facts-heading">
            {t.overviewProjectDetails}
          </h2>
          <div className="project-facts__grid">
            <article className="project-fact">
              <h3>{t.overviewProjectLocation}</h3>
              <ProjectPath path={project.path} />
              {overview.wasOpenedFromNestedFolder && (
                <p className="project-fact__nested">
                  {t.overviewOpenedFrom}
                  <span title={project.selectedPath}>{project.selectedPath}</span>
                </p>
              )}
            </article>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="empty-state" aria-busy={isOpening}>
      <div className={`empty-state__icon${isOpening ? " empty-state__icon--loading" : ""}`} aria-hidden="true">
        {isOpening ? <LoaderCircle /> : FOLDER_ICON}
      </div>
      <h2>{t.overviewEmptyTitle}</h2>
      <p>{t.overviewEmptyDescription}</p>
      <div className="empty-state__actions">
        <button className="primary-button" type="button" onClick={onOpenProject} disabled={isOpening}>
          {isOpening ? t.overviewOpening : t.overviewOpenProject}
        </button>
        <button className="secondary-button" type="button" disabled title={t.overviewCloneComingSoonTitle}>
          {t.overviewCloneFromGithub}
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  theme,
  setTheme,
  onOpenAbout,
  gitDiagnostics,
  gitUpdateStatus,
  onCheckGitUpdate,
  isCheckingGitUpdate,
  onRefreshGitDiagnostics,
  isRefreshingGitDiagnostics,
  reopenLastProject,
  setReopenLastProject,
  confirmCloseProject,
  setConfirmCloseProject,
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  onOpenAbout: () => void;
  gitDiagnostics: GitDiagnostics | null;
  gitUpdateStatus: GitUpdateStatus | null;
  onCheckGitUpdate: () => Promise<void>;
  isCheckingGitUpdate: boolean;
  onRefreshGitDiagnostics: () => Promise<void>;
  isRefreshingGitDiagnostics: boolean;
  reopenLastProject: boolean;
  setReopenLastProject: (value: boolean) => void;
  confirmCloseProject: boolean;
  setConfirmCloseProject: (value: boolean) => void;
}): React.JSX.Element {
  const { t, languagePreference, setLanguagePreference } = useLanguage();
  const [gitActionMessage, setGitActionMessage] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isStartingGitInstallation, setIsStartingGitInstallation] = useState(false);
  const [isStartingGitUpdate, setIsStartingGitUpdate] = useState(false);

  useEffect(() => {
    invoke<GitIdentity>("get_git_identity")
      .then((result) => {
        setNameInput(result.name ?? "");
        setEmailInput(result.email ?? "");
        setIsEditingIdentity(!(result.name?.trim() && result.email?.trim()));
      })
      .catch(() => undefined);
  }, []);

  const handleSaveIdentity = async (): Promise<void> => {
    setIdentityMessage(null);
    setIsSavingIdentity(true);
    try {
      await invoke("set_git_identity", { name: nameInput, email: emailInput });
      setIdentityMessage(t.identitySaved);
      setIsEditingIdentity(false);
    } catch (error) {
      setIdentityMessage(localizeAppError(error, t, t.identityCouldntSave));
    } finally {
      setIsSavingIdentity(false);
    }
  };

  const handleInstallGit = async (): Promise<void> => {
    setGitActionMessage(null);
    setIsStartingGitInstallation(true);
    try {
      const result = await invoke<GitInstallationResult>("install_git");
      if (result.guidanceUrl) {
        await openUrl(result.guidanceUrl);
      }
      switch (result.outcome) {
        case "started":
          setGitActionMessage(t.gitInstallerLaunched);
          break;
        case "guidance":
          setGitActionMessage(
            result.platform === "macos"
              ? t.gitMacosGuidanceOpened
              : result.platform === "linux"
                ? t.gitLinuxGuidanceOpened
                : t.gitWindowsGuidanceOpened,
          );
          break;
        case "already_starting":
          setGitActionMessage(t.gitInstallerAlreadyStarting);
          break;
        case "failed":
          setGitActionMessage(result.guidanceUrl ? t.gitInstallerFailedWithGuidance : t.gitCouldntStart);
          break;
      }
    } catch {
      setGitActionMessage(t.gitCouldntStart);
    } finally {
      setIsStartingGitInstallation(false);
    }
  };

  const handleUpdateGit = async (): Promise<void> => {
    setGitActionMessage(null);
    setIsStartingGitUpdate(true);
    try {
      const result = await invoke<GitUpdateLaunchResult>("update_git");
      switch (result.outcome) {
        case "started":
          setGitActionMessage(t.gitUpdateLaunched);
          break;
        case "already_starting":
          setGitActionMessage(t.gitUpdateAlreadyStarting);
          break;
        case "unavailable":
          setGitActionMessage(t.gitUpdateCheckerUnavailable);
          break;
        case "failed":
          setGitActionMessage(t.gitCouldntStart);
          break;
      }
    } catch {
      setGitActionMessage(t.gitCouldntStart);
    } finally {
      setIsStartingGitUpdate(false);
    }
  };

  return (
    <div className="settings-view">
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsAppearanceTitle}</h2>
          <p>{t.settingsAppearanceDescription}</p>
        </div>
        <div className="segmented-control" role="radiogroup" aria-label={t.themeAriaLabel}>
          {THEME_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              className={`segmented-control__option${theme === option ? " segmented-control__option--active" : ""}`}
              onClick={() => setTheme(option)}
            >
              <span aria-hidden="true">{THEME_ICONS[option]}</span>
              {option === "system" ? t.commonSystem : option === "light" ? t.themeLight : t.themeDark}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGeneralTitle}</h2>
          <p>{t.settingsGeneralDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.commonVersion}</strong>
            <p>GitOdrile {APP_VERSION}</p>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenAbout}>
            {t.settingsGeneralViewAbout}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.settingsGeneralGitLabel}</strong>
            {gitDiagnostics === null && <p>{t.settingsGeneralChecking}</p>}
            {gitDiagnostics?.state === "available" && (
              <>
                <p>
                  {gitDiagnostics.version}
                  {gitUpdateStatus?.state === "update_available" && (
                  <span className="settings-row__badge">{t.settingsGeneralUpdateAvailable}</span>
                  )}
                </p>
                {gitUpdateStatus === null && <p className="settings-row__hint">{t.gitUpdateNotChecked}</p>}
                {(isCheckingGitUpdate || gitUpdateStatus?.state === "checking") && (
                  <p className="settings-row__hint" role="status">{t.gitUpdateChecking}</p>
                )}
                {gitUpdateStatus?.state === "up_to_date" && (
                  <p className="settings-row__hint" role="status">{t.gitUpdateUpToDate}</p>
                )}
                {gitUpdateStatus?.state === "unavailable" && (
                  <p className="settings-row__hint settings-row__warning" role="status">
                    {t.gitUpdateCheckerUnavailable}
                  </p>
                )}
                {gitUpdateStatus?.state === "failed" && (
                  <p className="settings-row__hint settings-row__warning" role="status">{t.gitUpdateCheckFailed}</p>
                )}
                {gitUpdateStatus?.state === "timed_out" && (
                  <p className="settings-row__hint settings-row__warning" role="status">{t.gitUpdateCheckTimedOut}</p>
                )}
              </>
            )}
            {gitDiagnostics?.state === "missing" && (
              <p className="settings-row__warning">{t.settingsGeneralGitMissing}</p>
            )}
            {gitDiagnostics?.state === "unusable" && (
              <p className="settings-row__warning">{t.settingsGeneralGitUnusable}</p>
            )}
            {gitDiagnostics?.state === "check_failed" && (
              <p className="settings-row__warning">{t.settingsGeneralGitCheckFailed}</p>
            )}
            {gitActionMessage && <p className="settings-row__hint" role="status">{gitActionMessage}</p>}
          </div>
          <div className="settings-row__actions">
            {gitDiagnostics?.state === "missing" && (
              <button
                className="primary-button"
                type="button"
                disabled={isStartingGitInstallation}
                onClick={() => void handleInstallGit()}
              >
                {isStartingGitInstallation ? t.gitStartingInstaller : t.settingsGeneralInstallGit}
              </button>
            )}
            {gitDiagnostics?.state !== "available" && (
              <button
                className="secondary-button"
                type="button"
                disabled={isRefreshingGitDiagnostics}
                onClick={() => void onRefreshGitDiagnostics()}
              >
                {isRefreshingGitDiagnostics ? t.settingsGeneralChecking : t.settingsGeneralCheckAgain}
              </button>
            )}
            {gitDiagnostics?.state === "available" && (
              <button
                className="secondary-button"
                type="button"
                disabled={isCheckingGitUpdate}
                onClick={() => void onCheckGitUpdate()}
              >
                {isCheckingGitUpdate ? t.gitUpdateChecking : t.gitUpdateCheck}
              </button>
            )}
            {gitDiagnostics?.state === "available" && gitUpdateStatus?.state === "update_available" && (
              <button
                className="primary-button"
                type="button"
                disabled={isStartingGitUpdate}
                onClick={() => void handleUpdateGit()}
              >
                {isStartingGitUpdate ? t.gitUpdateStarting : t.settingsGeneralUpdate}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsIdentityTitle}</h2>
          <p>{t.settingsIdentityDescription}</p>
        </div>
        <div className="identity-fields">
          <label className="text-field">
            <span>{t.identityNameLabel}</span>
            <input
              type="text"
              ref={nameInputRef}
              value={nameInput}
              disabled={!isEditingIdentity}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder={t.identityNamePlaceholder}
            />
          </label>
          <label className="text-field">
            <span>{t.identityEmailLabel}</span>
            <input
              type="email"
              value={emailInput}
              disabled={!isEditingIdentity}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder={t.identityEmailPlaceholder}
            />
          </label>
        </div>
        <div className="settings-section__footer">
          {identityMessage && <p className="settings-row__hint" role="status">{identityMessage}</p>}
          {isEditingIdentity ? (
            <button
              className="primary-button"
              type="button"
              disabled={isSavingIdentity}
              onClick={() => void handleSaveIdentity()}
            >
              {isSavingIdentity ? t.identitySaving : t.identitySave}
            </button>
          ) : (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setIdentityMessage(null);
                setIsEditingIdentity(true);
                window.requestAnimationFrame(() => nameInputRef.current?.focus());
              }}
            >
              {t.identityModify}
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsStartupTitle}</h2>
          <p>{t.settingsStartupDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.startupReopenLabel}</strong>
            <p>{t.startupReopenDescription}</p>
          </div>
          <ToggleSwitch label={t.startupReopenLabel} checked={reopenLastProject} onChange={setReopenLastProject} />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsSafetyTitle}</h2>
          <p>{t.settingsSafetyDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.safetyConfirmLabel}</strong>
            <p>{t.safetyConfirmDescription}</p>
          </div>
          <ToggleSwitch label={t.safetyConfirmLabel} checked={confirmCloseProject} onChange={setConfirmCloseProject} />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsLanguageTitle}</h2>
          <p>{t.settingsLanguageDescription}</p>
        </div>
        <div className="segmented-control" role="radiogroup" aria-label={t.languageAriaLabel}>
          {LANGUAGE_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={languagePreference === option}
              className={`segmented-control__option${languagePreference === option ? " segmented-control__option--active" : ""}`}
              onClick={() => setLanguagePreference(option)}
            >
              {option === "system" ? t.commonSystem : LANGUAGE_NAMES[option as Language]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch${checked ? " toggle-switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch__knob" />
    </button>
  );
}

export function App(): React.JSX.Element {
  const { t } = useLanguage();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useTheme();
  const effectiveTheme = resolveEffectiveTheme(theme);
  const toggleTheme = (): void => setTheme(effectiveTheme === "dark" ? "light" : "dark");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
  );
  const [sessionsState, dispatchSessions] = useReducer(projectSessionsReducer, initialProjectSessionsState);
  // Owns the "which response is still current" counter per session. Lives
  // outside the reducer so a caller can read "the next generation" as a
  // plain synchronous value before the async status/pending-versions calls
  // even start (see `checkWorkingTree` below).
  const statusGenerationsRef = useRef<Record<string, number>>({});
  // The same idea for the version-lines read, on its own counter: that read
  // and the working-tree read start independently, so one counter would let
  // either refresh discard the other's in-flight result.
  const versionLinesGenerationsRef = useRef<Record<string, number>>({});
  // Dedupes concurrent version-lines reads for the same project, so the idle
  // prefetch and a user who reaches the screen before it finishes share one
  // Git process instead of racing.
  const versionLinesRequestsRef = useRef<Record<string, Promise<void>>>({});
  // Read diffs, kept per project across screen changes. Owned here rather
  // Watch events that arrive while a mutation owns the working tree are not
  // discarded. They are coalesced here and replayed when the dialog closes.
  const pendingWatchRefreshesRef = useRef<Record<string, { repositoryStateChanged: boolean }>>({});
  // than by `ChangesPanel` so leaving Changes and coming back is a cache hit
  // (see task 019); entries are dropped when their session closes.
  const diffCacheRef = useRef(createDiffCache());
  const activeSession = sessionsState.activeId ? sessionsState.byId[sessionsState.activeId] : null;
  const project = activeSession?.project ?? null;
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const pendingVersions = activeSession?.pendingVersions ?? EMPTY_PENDING_VERSIONS;
  const pendingVersionsError = activeSession?.pendingVersionsError ?? null;
  const [projectAnnouncement, setProjectAnnouncement] = useState("");
  const [storedProjectsOnLaunch] = useState(readStoredProjects);
  const [hasCompletedSessionRestore, setHasCompletedSessionRestore] = useState(false);

  const navigateToView = (next: View): void => {
    if (next === view) {
      return;
    }
    if (next !== "settings" && sessionsState.activeId) {
      dispatchSessions({ type: "navigate", id: sessionsState.activeId, view: next });
    }
    setView(next);
  };

  const goBack = (): void => {
    if (view === "settings") {
      setView(activeSession?.lastView ?? "overview");
      return;
    }
    if (!activeSession || activeSession.viewHistoryIndex === 0) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex - 1;
    dispatchSessions({ type: "goBack", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const goForward = (): void => {
    if (
      view === "settings" ||
      !activeSession ||
      activeSession.viewHistoryIndex >= activeSession.viewHistory.length - 1
    ) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex + 1;
    dispatchSessions({ type: "goForward", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const canGoBack =
    view === "settings" || Boolean(activeSession && activeSession.viewHistoryIndex > 0);
  const canGoForward =
    view !== "settings" &&
    Boolean(
      activeSession &&
        activeSession.viewHistoryIndex < activeSession.viewHistory.length - 1,
    );
  // The failed-open message and whether its dialog is showing are tracked
  // separately (rather than deriving visibility from `openError !== null`)
  // so `useModalFocus` gets a stable setter — see the identical rationale in
  // `SaveVersionDialog`/`PublishDialog`'s `onCloseRef` comments.
  const [openError, setOpenError] = useState<string | null>(null);
  const [openErrorTitle, setOpenErrorTitle] = useState(t.overviewOpenFailedTitle);
  const [isOpenErrorDialogOpen, setIsOpenErrorDialogOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [publishDialogSessionId, setPublishDialogSessionId] = useState<string | null>(null);
  const [publishUpTo, setPublishUpTo] = useState<string | null>(null);
  const [saveDialogSessionId, setSaveDialogSessionId] = useState<string | null>(null);
  // Overview's bounded quick-switch/quick-create: distinct from the
  // Version-lines screen's own dialogs (see `versionLinesPanel.tsx`) because
  // Overview isn't that screen's React subtree — both ultimately drive the
  // same Rust plan/execute commands through the same dialog components.
  const [overviewSwitchTarget, setOverviewSwitchTarget] = useState<string | null>(null);
  const [overviewCreateRequest, setOverviewCreateRequest] = useState<{ forceSwitch: boolean } | null>(null);
  const [versionLinesAutoOpenCreate, setVersionLinesAutoOpenCreate] = useState(false);
  const publishDialogSession = publishDialogSessionId
    ? sessionsState.byId[publishDialogSessionId] ?? null
    : null;
  // Blocking rather than retargeting an open confirmation/operation is
  // simpler and safer than reconciling it against a different project mid-
  // flight (see the "Decisions" section of task 012): switching and closing
  // the active project are both disabled while either dialog is open.
  const hasBlockingDialog =
    publishDialogSessionId !== null ||
    saveDialogSessionId !== null ||
    activeSession?.operation?.kind === "version-line";
  const showErrorDialog = (title: string, message: string): void => {
    setOpenErrorTitle(title);
    setOpenError(message);
    setIsOpenErrorDialogOpen(true);
  };

  const startSessionOperation = (
    kind: "save" | "publish",
    upTo?: string,
  ): void => {
    const session = activeSession;
    if (!session) {
      return;
    }
    const blocker = getMutationBlocker(sessionsState, session.id);
    if (blocker) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherMutationBlocked(blocker.project.name),
      );
      return;
    }
    dispatchSessions({ type: "startOperation", id: session.id, kind });
    if (kind === "save") {
      setSaveDialogSessionId(session.id);
    } else {
      setPublishUpTo(upTo ?? null);
      setPublishDialogSessionId(session.id);
    }
  };

  const openPublishDialog = (upTo?: string): void => {
    startSessionOperation("publish", upTo);
  };
  const [skippedRestoreCount, setSkippedRestoreCount] = useState(0);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [gitDiagnostics, setGitDiagnostics] = useState<GitDiagnostics | null>(null);
  const [isRefreshingGitDiagnostics, setIsRefreshingGitDiagnostics] = useState(false);
  const [gitUpdateStatus, setGitUpdateStatus] = useState<GitUpdateStatus | null>(null);
  const [isCheckingGitUpdate, setIsCheckingGitUpdate] = useState(false);
  const [reopenLastProject, setReopenLastProject] = useState(() =>
    readStoredBoolean(REOPEN_LAST_PROJECT_STORAGE_KEY, false),
  );
  const [confirmCloseProject, setConfirmCloseProject] = useState(() =>
    readStoredBoolean(CONFIRM_CLOSE_PROJECT_STORAGE_KEY, true),
  );
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const aboutDialogRef = useRef<HTMLDivElement>(null);
  const closeConfirmDialogRef = useRef<HTMLDivElement>(null);
  const openErrorDialogRef = useRef<HTMLDivElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const palettePreviouslyFocusedRef = useRef<HTMLElement | null>(null);

  useModalFocus(isAboutOpen, aboutDialogRef, setIsAboutOpen);
  useModalFocus(isCloseConfirmOpen, closeConfirmDialogRef, setIsCloseConfirmOpen);
  useModalFocus(isOpenErrorDialogOpen, openErrorDialogRef, setIsOpenErrorDialogOpen);

  // Whichever path closed the confirmation (Cancel, Escape, or confirming
  // the close), the target it referred to stops being relevant.
  useEffect(() => {
    if (!isCloseConfirmOpen) {
      setCloseTargetId(null);
    }
  }, [isCloseConfirmOpen]);

  // Same idea: once the dialog is gone (Escape, backdrop click, or the
  // button), the message it was showing stops mattering.
  useEffect(() => {
    if (!isOpenErrorDialogOpen) {
      setOpenError(null);
    }
  }, [isOpenErrorDialogOpen]);

  // Only the order, membership, and active id ever reach storage — no diffs,
  // source contents, credentials, tokens, or raw Git errors (those all live
  // only in `sessionsState.byId`, which never leaves memory).
  useEffect(() => {
    if (!hasCompletedSessionRestore) {
      return;
    }
    writeStoredProjects(projectSessionsStateToStored(sessionsState));
  }, [hasCompletedSessionRestore, sessionsState.order, sessionsState.activeId]);

  const openPalette = (): void => {
    palettePreviouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsPaletteOpen(true);
  };

  const closePalette = (): void => {
    setIsPaletteOpen(false);
    (palettePreviouslyFocusedRef.current ?? paletteTriggerRef.current)?.focus();
  };

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(REOPEN_LAST_PROJECT_STORAGE_KEY, String(reopenLastProject));
  }, [reopenLastProject]);

  useEffect(() => {
    localStorage.setItem(CONFIRM_CLOSE_PROJECT_STORAGE_KEY, String(confirmCloseProject));
  }, [confirmCloseProject]);

  const refreshGitDiagnostics = async (): Promise<void> => {
    setIsRefreshingGitDiagnostics(true);
    try {
      const result = await invoke<GitDiagnostics>("git_diagnostics");
      setGitDiagnostics(result);
      if (result.state !== "available") {
        setGitUpdateStatus(null);
      }
    } catch {
      setGitDiagnostics({ state: "check_failed", version: null });
    } finally {
      setIsRefreshingGitDiagnostics(false);
    }
  };

  useEffect(() => {
    void refreshGitDiagnostics();
  }, []);

  const checkGitUpdate = async (): Promise<void> => {
    setIsCheckingGitUpdate(true);
    setGitUpdateStatus({ state: "checking", cached: false });
    try {
      setGitUpdateStatus(await invoke<GitUpdateStatus>("check_git_update"));
    } catch {
      setGitUpdateStatus({ state: "failed", cached: false });
    } finally {
      setIsCheckingGitUpdate(false);
    }
  };

  const checkWorkingTree = async (path: string): Promise<void> => {
    const generation = (statusGenerationsRef.current[path] ?? 0) + 1;
    statusGenerationsRef.current[path] = generation;
    dispatchSessions({ type: "startStatusCheck", id: path, generation });
    try {
      const status = await invoke<WorkingTreeStatus>("read_working_tree_status", { path });
      dispatchSessions({
        type: "applyWorkingTree",
        id: path,
        generation,
        workingTree: status,
      });
    } catch (error) {
      // Keep the last known status visible; the card reports the failure only
      // when it has nothing truthful to show instead.
      dispatchSessions({
        type: "applyWorkingTreeError",
        id: path,
        generation,
        error: localizeAppError(error, t, t.statusCouldntCheck),
      });
    }
    // Independent of the status outcome above: a failure here must never
    // blank out or corrupt the primary working-tree status. Guarded by the
    // same generation as the status call above so a superseded refresh's
    // pending-versions result can't land after a newer one either.
    try {
      const result = await invoke<PendingVersionsResult>("list_unpublished_versions", { path });
      dispatchSessions({ type: "applyPendingVersions", id: path, generation, result });
    } catch (error) {
      dispatchSessions({
        type: "applyPendingVersionsError",
        id: path,
        generation,
        error: localizeAppError(error, t, t.overviewPendingVersionsError),
      });
    }
  };

  /** Re-reads the branch inventory into the project's session. Safe to call
   * speculatively: concurrent calls for the same project share one request,
   * and the cached snapshot stays on screen throughout, so this is invisible
   * unless it is the project's first read. */
  const refreshVersionLines = (path: string): Promise<void> => {
    const inFlight = versionLinesRequestsRef.current[path];
    if (inFlight) {
      return inFlight;
    }
    const generation = (versionLinesGenerationsRef.current[path] ?? 0) + 1;
    versionLinesGenerationsRef.current[path] = generation;
    dispatchSessions({ type: "startVersionLinesLoad", id: path, generation });
    const request = invoke<VersionLinesSnapshot>("get_version_lines", { path })
      .then((snapshot) => {
        dispatchSessions({ type: "applyVersionLines", id: path, generation, snapshot });
      })
      .catch((error: unknown) => {
        dispatchSessions({
          type: "applyVersionLinesError",
          id: path,
          generation,
          error: localizeAppError(error, t, t.versionLinesErrorLoading),
        });
      })
      .finally(() => {
        delete versionLinesRequestsRef.current[path];
      });
    versionLinesRequestsRef.current[path] = request;
    return request;
  };

  /** Stores a snapshot a mutation already returned, skipping a re-read. The
   * generation is bumped first so an older in-flight read can't land on top
   * of it; both dispatches are batched into one render, so the momentary
   * `isLoadingVersionLines` never reaches the screen. */
  const commitVersionLines = (path: string, snapshot: VersionLinesSnapshot): void => {
    const generation = (versionLinesGenerationsRef.current[path] ?? 0) + 1;
    versionLinesGenerationsRef.current[path] = generation;
    dispatchSessions({ type: "startVersionLinesLoad", id: path, generation });
    dispatchSessions({ type: "applyVersionLines", id: path, generation, snapshot });
  };

  // A successful create/switch/delete on a version line changes `HEAD`, the
  // index, and the working tree — every one of task 016's "Operation
  // coordination and refresh" invalidation targets that already exist in
  // this app. Re-reading the repository facts (branch/head state) through
  // the same `"open"` action `handleOpenProject` uses below re-hydrates the
  // active session in place (same `id`, since the path never changes), and
  // `checkWorkingTree` covers both the working-tree status and the pending-
  // versions list save/publish depend on. Clearing the Changes selection
  // stops a diff/file that may not exist on the new line from staying
  // "selected". The branch inventory is re-read too, now that it is cached
  // per session rather than owned by the Version-lines screen: the screen's
  // own dialogs hand their fresh snapshot straight back (see
  // `commitVersionLines`), but Overview's quick switch/create reach the same
  // commands from outside that screen, and their result must not be left
  // behind in the cache.
  const handleVersionLineChanged = async (path: string): Promise<void> => {
    try {
    delete pendingWatchRefreshesRef.current[path];
      const info = await invoke<RepositoryInfo>("open_repository", { path });
      dispatchSessions({ type: "open", project: info });
    } catch {
      // Best-effort: the working-tree refresh below still runs, and the
      // next status check will eventually re-derive the branch too.
    }
    dispatchSessions({ type: "setChangesSelection", id: path, selection: EMPTY_CHANGES_SELECTION });
    void refreshVersionLines(path);
    await checkWorkingTree(path);
  };

  // Switching or opening a project moves the visible screen to whatever that
  const refreshRepositoryState = async (path: string): Promise<void> => {
    try {
      const info = await invoke<RepositoryInfo>("open_repository", { path });
      dispatchSessions({ type: "open", project: info });
    } catch {
      // Keep the last known identity visible; the working-tree refresh below
      // still runs and the next repository event/navigation can retry.
    }
    void refreshVersionLines(path);
    await checkWorkingTree(path);
  };

  const startVersionLineOperation = (path: string): boolean => {
    const session = sessionsState.byId[path];
    if (!session) {
      return false;
    }
    const blocker = getMutationBlocker(sessionsState, path);
    if (blocker) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherMutationBlocked(blocker.project.name),
      );
      return false;
    }
    dispatchSessions({ type: "startOperation", id: path, kind: "version-line" });
    return true;
  };

  const finishSessionOperation = (path: string): void => {
    dispatchSessions({ type: "finishOperation", id: path });
    const pending = pendingWatchRefreshesRef.current[path];
    if (!pending) {
      return;
    }
    delete pendingWatchRefreshesRef.current[path];
    if (pending.repositoryStateChanged) {
      void refreshRepositoryState(path);
    } else {
      void checkWorkingTree(path);
    }
  };

  const setVersionLineOperationPhase = (
    path: string,
    phase: "planning" | "executing" | "error" | "success",
  ): void => {
    dispatchSessions({ type: "setOperationPhase", id: path, phase });
  };

  // session was last showing — unless the user is currently in Settings,
  // which is application-wide and stays exactly where it is regardless of
  // which project is active underneath it.
  const syncViewToSession = (targetLastView: ProjectView): void => {
    if (view !== "settings" && view !== targetLastView) {
      setView(targetLastView);
    }
  };

  const activateSession = (id: string): void => {
    if (hasBlockingDialog || id === sessionsState.activeId) {
      return;
    }
    const target = sessionsState.byId[id];
    if (!target) {
      return;
    }
    dispatchSessions({ type: "activate", id });
    syncViewToSession(target.lastView);
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(target.project.name));
    void checkWorkingTree(target.project.path);
  };

  const handleOpenProject = async (): Promise<void> => {
    if (hasBlockingDialog) {
      return;
    }
    setOpenError(null);
    try {
      const selected = await openFolderDialog({ directory: true, multiple: false, title: t.overviewOpenDialogTitle });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      setIsOpening(true);
      const info = await invoke<RepositoryInfo>("open_repository", { path: selected });
      // Opening an already-open worktree activates it instead of duplicating
      // it — `existing` is read before dispatching so its (possibly stale)
      // `lastView` is available for `syncViewToSession` below.
      const existing = sessionsState.byId[info.path];
      dispatchSessions({ type: "open", project: info });
      syncViewToSession(existing?.lastView ?? "overview");
      setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
      if (!existing) {
        void checkWorkingTree(info.path);
      }
    } catch (error) {
      // Opening failures belong only to the attempted path; existing
      // sessions are never touched by a failed `open_repository` call. When
      // a project is already active, this is reported in its own dialog
      // rather than inside that project's Overview card — otherwise it
      // would read as if the *active* project were the one that failed.
      showErrorDialog(
        t.overviewOpenFailedTitle,
        localizeAppError(error, t, t.overviewCouldntOpenFolder),
      );
    } finally {
      setIsOpening(false);
    }
  };

  // Restores the previous session's open projects exactly once, on launch.
  // Every stored path is revalidated through `open_repository` in order; one
  // that's missing, unreadable, or no longer a repository is skipped without
  // blocking the rest, and only a count of skipped projects is surfaced —
  // never the raw Git error.
  useEffect(() => {
    if (!reopenLastProject) {
      setHasCompletedSessionRestore(true);
      return;
    }
    const stored = storedProjectsOnLaunch;
    if (stored.order.length === 0) {
      setHasCompletedSessionRestore(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      let skipped = 0;
      for (const path of stored.order) {
        if (cancelled) {
          return;
        }
        try {
          const info = await invoke<RepositoryInfo>("open_repository", { path });
          dispatchSessions({ type: "open", project: info });
          void checkWorkingTree(info.path);
        } catch {
          skipped += 1;
        }
      }
      if (cancelled) {
        return;
      }
      if (stored.activeId) {
        dispatchSessions({ type: "activate", id: stored.activeId });
      }
      if (skipped > 0) {
        setSkippedRestoreCount(skipped);
      }
      setHasCompletedSessionRestore(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only ever run once, on launch — reopenLastProject changing later
    // shouldn't retroactively restore or discard anything mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectPath = project?.path ?? null;
  // `pendingVersions` is the real, local-only list of not-yet-published
  // saved versions (see `list_unpublished_versions`'s doc comment for the
  // "cached, possibly optimistic" caveat — it reflects the last-known
  // remote-tracking state, not a fresh preflight). Its length is a more
  // accurate publish-entry-point signal than the old ahead-count heuristic,
  // since it already accounts for the no-upstream-yet case (everything
  // local is reported as pending) with no extra branching needed here.
  const canPublish = Boolean(
    project &&
      project.headState === "branch" &&
      (pendingVersions.totalCount > 0 || pendingVersionsError),
  );

  // Live working-tree updates (task 020). The Rust watcher reports that
  // *something* changed; what changed is answered by the same status read the
  // "Check changes" button performs, so this adds a trigger and nothing else.
  // Held in a ref because the listener below is registered once, on mount,
  // and would otherwise close over the first render's state forever.
  const handleRepositoryChangedRef = useRef<(
    path: string,
    repositoryStateChanged?: boolean,
  ) => void>(() => {});
  handleRepositoryChangedRef.current = (path: string, repositoryStateChanged = false) => {
    const session = sessionsState.byId[path];
    if (!session) {
      // A watch that outlived its session by a few milliseconds. Queueing
      // here would strand an entry nothing ever replays, and would fire a
      // refresh nobody asked for if the project were reopened later.
      return;
    }
    if (!shouldRefreshOnWatchEvent(session)) {
      const pending = pendingWatchRefreshesRef.current[path];
      pendingWatchRefreshesRef.current[path] = {
        repositoryStateChanged: repositoryStateChanged || Boolean(pending?.repositoryStateChanged),
      };
      return;
    }
    if (repositoryStateChanged) {
      void refreshRepositoryState(path);
    } else {
      void checkWorkingTree(path);
    }
  };

  useEffect(() => {
    // Outside Tauri (tests, a plain `vite dev`) there is no event bus to
    // listen on, and the manual refresh path is unaffected.
    if (!("__TAURI_INTERNALS__" in window)) {
      return undefined;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<{ path: string; repositoryStateChanged?: boolean }>("repository-changed", (event) => {
      handleRepositoryChangedRef.current(
        event.payload.path,
        event.payload.repositoryStateChanged ?? false,
      );
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {
        // A listener that can't be registered leaves the app exactly as it
        // was before this feature: manual refreshes only.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Only the active project is watched: the others already refresh when they
  // Module-level idle work outlived jsdom test environments and left lazy
  // imports running after teardown. Owning it here gives React a real cleanup
  // point while preserving the same after-first-paint scheduling in the app.
  useEffect(() => scheduleIdleTask(prefetchLazyPanels), []);

  // become active, and watching every open project multiplies the OS-level
  // cost for state nobody is looking at. Gated on the startup restore so the
  // watch (and its one `rev-parse`) never competes with launch.
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath) {
      return undefined;
    }
    void invoke<boolean>("watch_repository", { path: projectPath }).catch(() => {
      // Network shares, container mounts, and exhausted watch budgets all
      // land here. The project stays on the manual "Check changes" path.
    });
    return () => {
      void invoke("unwatch_repository", { path: projectPath }).catch(() => {});
    };
  }, [hasCompletedSessionRestore, projectPath]);

  // Warms the active project's branch inventory during idle time, so the
  // first visit to Version lines already has something to render. Gated on
  // the startup restore having finished and deferred to idle so it can never
  // add Git work to launch; skipped entirely for a project that already has
  // a cached snapshot, since the effect below covers keeping it current.
  const hasCachedVersionLines = (activeSession?.versionLines ?? null) !== null;
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || hasCachedVersionLines) {
      return undefined;
    }
    return scheduleIdleTask(() => {
      void refreshVersionLines(projectPath);
    });
  }, [hasCompletedSessionRestore, projectPath, hasCachedVersionLines]);

  // Revalidates on arrival at the screen itself — the one moment the user is
  // looking straight at this data, and the only place branches created
  // outside GitOdrile would otherwise go unnoticed. Invisible when a snapshot
  // is already cached: it stays on screen while this runs.
  useEffect(() => {
    if (view !== "version-lines" || !projectPath) {
      return;
    }
    void refreshVersionLines(projectPath);
  }, [view, projectPath]);

  // The Changes and Version-lines screens only exist for an opened project;
  // if the project closes while one is showing, leave immediately rather
  // than rendering it against a project that is no longer open.
  useEffect(() => {
    if ((view === "changes" || view === "version-lines") && !project) {
      navigateToView("overview");
    }
  }, [view, project]);

  const performCloseSession = (id: string): void => {
    const index = sessionsState.order.indexOf(id);
    const remainingOrder = sessionsState.order.filter((sessionId) => sessionId !== id);
    const nextActiveId =
      sessionsState.activeId === id && remainingOrder.length > 0
        ? remainingOrder[Math.min(index, remainingOrder.length - 1)]
        : sessionsState.activeId;
    const nextSession = nextActiveId ? sessionsState.byId[nextActiveId] : null;
    // The session's own state goes with the reducer; the diff cache lives
    // outside it and has to be dropped explicitly, or a closed project's
    // file contents would stay in memory for the rest of the run.
    // The generation counters deliberately survive: they are monotonic per
    // path, and resetting one while a read is still in flight would let that
    // read's response be accepted by a *reopened* session as if it were its
    // own. Same reason `statusGenerationsRef` is never cleared.
    releaseDiffCache(diffCacheRef.current, id);
    dispatchSessions({ type: "close", id });
    delete pendingWatchRefreshesRef.current[id];
    if (sessionsState.activeId === id && view !== "settings") {
      setView(nextSession?.lastView ?? "overview");
      if (nextSession) {
        setProjectAnnouncement(
          t.projectSwitcherActiveAnnouncement(nextSession.project.name),
        );
      }
    }
    setIsCloseConfirmOpen(false);
  };

  const requestCloseSession = (id: string): void => {
    const session = sessionsState.byId[id];
    if (!session) {
      return;
    }
    if (
      session.operation?.phase === "executing" ||
      session.operation?.phase === "verifying"
    ) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherCloseBlocked(session.project.name),
      );
      return;
    }
    if (id === sessionsState.activeId && hasBlockingDialog) {
      return;
    }
    if (confirmCloseProject) {
      setCloseTargetId(id);
      setIsCloseConfirmOpen(true);
    } else {
      performCloseSession(id);
    }
  };

  const requestCloseActiveProject = (): void => {
    if (sessionsState.activeId) {
      requestCloseSession(sessionsState.activeId);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Tab") {
        // Never captured while the user is typing — Ctrl/Cmd+Tab still
        // reaches whatever native behavior applies inside a text field.
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
          return;
        }
        if (hasBlockingDialog || sessionsState.order.length < 2) {
          return;
        }
        event.preventDefault();
        const currentIndex = sessionsState.activeId ? sessionsState.order.indexOf(sessionsState.activeId) : -1;
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + sessionsState.order.length) % sessionsState.order.length;
        activateSession(sessionsState.order[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [sessionsState, hasBlockingDialog, view]);

  const commands: Command[] = [
    { id: "go-overview", label: t.commandGoOverview, action: () => navigateToView("overview") },
    ...(project ? [{ id: "go-changes", label: t.navChanges, action: () => navigateToView("changes") }] : []),
    ...(project
      ? [
          {
            id: "go-version-lines",
            label: t.commandGoVersionLines,
            action: () => navigateToView("version-lines"),
          },
          {
            id: "new-version-line",
            label: t.commandNewVersionLine,
            action: () => {
              navigateToView("version-lines");
              setVersionLinesAutoOpenCreate(true);
            },
          },
        ]
      : []),
    { id: "go-settings", label: t.commandGoSettings, action: () => navigateToView("settings") },
    ...(!hasBlockingDialog
      ? [
          {
            id: "open-project",
            label: project ? t.overviewOpenAnotherProject : t.overviewOpenProject,
            action: () => void handleOpenProject(),
          },
        ]
      : []),
    ...(project && !hasBlockingDialog
      ? [{ id: "close-project", label: t.commandCloseActiveProject, action: requestCloseActiveProject }]
      : []),
    ...(!hasBlockingDialog
      ? sessionsState.order
          .filter((id) => id !== sessionsState.activeId)
          .map((id) => ({
            id: `switch-${id}`,
            label: t.commandSwitchToProject(sessionsState.byId[id].project.name),
            action: () => activateSession(id),
          }))
      : []),
    { id: "theme-system", label: t.commandUseSystemTheme, action: () => setTheme("system") },
    { id: "theme-light", label: t.commandUseLightTheme, action: () => setTheme("light") },
    { id: "theme-dark", label: t.commandUseDarkTheme, action: () => setTheme("dark") },
    {
      id: "toggle-sidebar",
      label: isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse,
      action: () => setIsSidebarCollapsed((collapsed) => !collapsed),
    },
    { id: "about", label: t.aboutGitOdrile, action: () => setIsAboutOpen(true) },
  ];

  const projectNameCounts = sessionsState.order.reduce<Record<string, number>>((counts, id) => {
    const name = sessionsState.byId[id].project.name.toLocaleLowerCase();
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
  const switcherEntries: ProjectSwitcherEntry[] = sessionsState.order.map((id) => {
    const session = sessionsState.byId[id];
    const normalizedPath = session.project.path.replaceAll("\\", "/").replace(/\/+$/, "");
    const pathParts = normalizedPath.split("/");
    return {
      id,
      name: session.project.name,
      contextLabel:
        projectNameCounts[session.project.name.toLocaleLowerCase()] > 1
          ? pathParts.at(-2) ?? normalizedPath
          : null,
      hasError: Boolean(session.workingTreeError || session.pendingVersionsError),
      hasOperationInProgress: Boolean(
        session.operation &&
          session.operation.phase !== "error" &&
          session.operation.phase !== "success",
      ),
      hasUnsavedChanges: Boolean(session.workingTree && !session.workingTree.isClean),
    };
  });
  const closeTargetSession = closeTargetId ? sessionsState.byId[closeTargetId] : null;

  const appWindow = "__TAURI_INTERNALS__" in window
    ? getCurrentWindow()
    : {
        minimize: async () => {},
        toggleMaximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
        onResized: async () => () => {},
      };
  const performWindowAction = (action: () => Promise<void>): void => {
    void action().catch(() => undefined);
  };

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void appWindow.isMaximized().then((maximized) => {
      if (!cancelled) setIsWindowMaximized(maximized);
    });

    void appWindow.onResized(() => {
      void appWindow.isMaximized().then((maximized) => {
        if (!cancelled) setIsWindowMaximized(maximized);
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="app-window">
      <span className="visually-hidden" role="status" aria-live="polite">
        {projectAnnouncement}
      </span>
      <header className="window-titlebar">
        <div className="window-titlebar__brand" data-tauri-drag-region>
          <span className="window-titlebar__mark" aria-hidden="true">{CROCODILE_MARK}</span>
          <span className="window-titlebar__name" data-tauri-drag-region>GitOdrile</span>
        </div>

        <div className="window-titlebar__actions">
          <TitlebarMenu onOpenAbout={() => setIsAboutOpen(true)} />
          <button
            className="titlebar-icon-button"
            type="button"
            ref={paletteTriggerRef}
            aria-label={t.titlebarOpenCommandPalette}
            title={t.titlebarJumpToHint}
            onClick={openPalette}
          >
            {SEARCH_ICON}
          </button>
          <div className="titlebar-history-controls">
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoBack}
              title={t.titlebarGoBack}
              aria-label={t.titlebarGoBack}
              onClick={goBack}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoForward}
              title={t.titlebarGoForward}
              aria-label={t.titlebarGoForward}
              onClick={goForward}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <span className="titlebar-badge" aria-label={t.alphaBadgeAriaLabel}>{t.alphaBadge}</span>
          <button
            className="titlebar-icon-button titlebar-theme-toggle"
            type="button"
            aria-label={effectiveTheme === "dark" ? t.titlebarSwitchToLightTheme : t.titlebarSwitchToDarkTheme}
            title={effectiveTheme === "dark" ? t.titlebarSwitchToLightTheme : t.titlebarSwitchToDarkTheme}
            onClick={toggleTheme}
          >
            {effectiveTheme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>

        <div
          className="window-titlebar__drag"
          data-tauri-drag-region
          onDoubleClick={() => performWindowAction(() => appWindow.toggleMaximize())}
        />

        <div className="window-controls" aria-label={t.windowControls}>
          <button
            className="window-control"
            type="button"
            aria-label={t.windowMinimize}
            onClick={() => performWindowAction(() => appWindow.minimize())}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            className="window-control"
            type="button"
            aria-label={t.windowMaximize}
            onClick={() => performWindowAction(() => appWindow.toggleMaximize())}
          >
            {isWindowMaximized ? (
              <Copy className="window-control__maximize-icon" aria-hidden="true" />
            ) : (
              <Square className="window-control__maximize-icon" aria-hidden="true" />
            )}
          </button>
          <button
            className="window-control window-control--close"
            type="button"
            aria-label={t.windowClose}
            onClick={() => performWindowAction(() => appWindow.close())}
          >
            <span className="window-control__close" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className={`app-shell${isSidebarCollapsed ? " app-shell--collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">{CROCODILE_MARK}</div>
              {!isSidebarCollapsed && (
                <div className="brand-copy">
                  <strong>GitOdrile</strong>
                  <span>{t.brandTagline}</span>
                </div>
              )}
            </div>
          </div>

          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            className="sidebar-scroll auto-hide-scrollbar"
          >
            <nav aria-label={t.navProjectAriaLabel}>
              <button
                className={`nav-item${view === "overview" ? " nav-item--active" : ""}`}
                type="button"
                aria-current={view === "overview" ? "page" : undefined}
                title={t.navOverview}
                onClick={() => navigateToView("overview")}
              >
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.overview}</span>
                <span className="nav-item__label">{t.navOverview}</span>
              </button>
              <button
                className={`nav-item${view === "changes" ? " nav-item--active" : ""}`}
                type="button"
                disabled={!project}
                aria-current={view === "changes" ? "page" : undefined}
                title={project ? t.navChanges : t.navChangesTitle}
                onClick={() => navigateToView("changes")}
              >
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.changes}</span>
                <span className="nav-item__label">{t.navChanges}</span>
              </button>
              <button
                className={`nav-item${view === "version-lines" ? " nav-item--active" : ""}`}
                type="button"
                disabled={!project}
                aria-current={view === "version-lines" ? "page" : undefined}
                title={project ? t.navVersionLines : t.navVersionLinesTitle}
                onClick={() => navigateToView("version-lines")}
              >
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.versionLines}</span>
                <span className="nav-item__label">{t.navVersionLines}</span>
              </button>
              <button className="nav-item" type="button" disabled title={t.navHistoryTitle}>
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.history}</span>
                <span className="nav-item__label">{t.navHistory}</span>
                <span className="nav-item__availability">{t.navComingSoon}</span>
              </button>
              <button className="nav-item" type="button" disabled title={t.navRecoveryTitle}>
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.recovery}</span>
                <span className="nav-item__label">{t.navRecovery}</span>
                <span className="nav-item__availability">{t.navComingSoon}</span>
              </button>
            </nav>

            <div className="sidebar-divider" aria-hidden="true" />

            {isSidebarCollapsed ? (
              <ProjectSwitcherIcons
                entries={switcherEntries}
                activeId={sessionsState.activeId}
                canSwitch={!hasBlockingDialog}
                isOpening={isOpening}
                onActivate={activateSession}
                onClose={requestCloseSession}
                onOpenAnother={() => void handleOpenProject()}
              />
            ) : (
              <ProjectSwitcher
                entries={switcherEntries}
                activeId={sessionsState.activeId}
                canSwitch={!hasBlockingDialog}
                isOpening={isOpening}
                onActivate={activateSession}
                onClose={requestCloseSession}
                onOpenAnother={() => void handleOpenProject()}
              />
            )}
          </div>

          <div className="sidebar-divider" aria-hidden="true" />

          <div className="sidebar-footer">
            <nav aria-label={t.navApplicationAriaLabel} className="nav--secondary">
              <button
                className={`nav-item${view === "settings" ? " nav-item--active" : ""}`}
                type="button"
                aria-current={view === "settings" ? "page" : undefined}
                title={t.navSettings}
                onClick={() => navigateToView("settings")}
              >
                <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.settings}</span>
                <span className="nav-item__label">{t.navSettings}</span>
              </button>
            </nav>
            <button
              className="sidebar-toggle"
              type="button"
              title={isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse}
              aria-label={isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse}
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span aria-hidden="true">{isSidebarCollapsed ? NAV_ICONS.expand : NAV_ICONS.collapse}</span>
            </button>
          </div>
        </aside>

        <section
          {...autoHideScrollbarProps<HTMLElement>()}
          className={`workspace auto-hide-scrollbar${view === "changes" ? " workspace--changes" : ""}`}
        >
          <div className="compact-nav-row">
            <ProjectSwitcherCompact
              entries={switcherEntries}
              activeId={sessionsState.activeId}
              canSwitch={!hasBlockingDialog}
              isOpening={isOpening}
              onActivate={activateSession}
              onClose={requestCloseSession}
              onOpenAnother={() => void handleOpenProject()}
            />
            <div className="compact-history-controls" aria-label={t.titlebarHistoryControls}>
              <button
                className="titlebar-icon-button"
                type="button"
                disabled={!canGoBack}
                title={t.titlebarGoBack}
                aria-label={t.titlebarGoBack}
                onClick={goBack}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                className="titlebar-icon-button"
                type="button"
                disabled={!canGoForward}
                title={t.titlebarGoForward}
                aria-label={t.titlebarGoForward}
                onClick={goForward}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <nav className="compact-nav" aria-label={t.navApplicationAriaLabel}>
              <button
                className={`compact-nav__item${view === "overview" ? " compact-nav__item--active" : ""}`}
                type="button"
                aria-current={view === "overview" ? "page" : undefined}
                onClick={() => navigateToView("overview")}
              >
                <span aria-hidden="true">{NAV_ICONS.overview}</span>
                {t.navOverview}
              </button>
              {project && (
                <button
                  className={`compact-nav__item${view === "changes" ? " compact-nav__item--active" : ""}`}
                  type="button"
                  aria-current={view === "changes" ? "page" : undefined}
                  onClick={() => navigateToView("changes")}
                >
                  <span aria-hidden="true">{NAV_ICONS.changes}</span>
                  {t.navChanges}
                </button>
              )}
              {project && (
                <button
                  className={`compact-nav__item${view === "version-lines" ? " compact-nav__item--active" : ""}`}
                  type="button"
                  aria-current={view === "version-lines" ? "page" : undefined}
                  onClick={() => navigateToView("version-lines")}
                >
                  <span aria-hidden="true">{NAV_ICONS.versionLines}</span>
                  {t.navVersionLines}
                </button>
              )}
              <button
                className={`compact-nav__item${view === "settings" ? " compact-nav__item--active" : ""}`}
                type="button"
                aria-current={view === "settings" ? "page" : undefined}
                onClick={() => navigateToView("settings")}
              >
                <span aria-hidden="true">{NAV_ICONS.settings}</span>
                {t.navSettings}
              </button>
            </nav>
          </div>
          {(view === "settings" || (view === "overview" && !project)) && (
            <header className="topbar">
              <h1>{view === "settings" ? t.navSettings : t.navOverview}</h1>
            </header>
          )}

          {view === "overview" && skippedRestoreCount > 0 && (
            <p className="restore-skipped-notice" role="status">
              <span>{t.startupRestoreSkippedNotice(skippedRestoreCount)}</span>
              <button
                type="button"
                aria-label={t.commonClose}
                title={t.commonClose}
                onClick={() => setSkippedRestoreCount(0)}
              >
                <X aria-hidden="true" />
              </button>
            </p>
          )}

          {view === "overview" ? (
            <OverviewPanel
              project={project}
              isOpening={isOpening}
              workingTree={workingTree}
              workingTreeError={workingTreeError}
              isCheckingChanges={isCheckingChanges}
              onCheckChanges={() => projectPath && void checkWorkingTree(projectPath)}
              onReviewChanges={() => navigateToView("changes")}
              onOpenProject={() => void handleOpenProject()}
              onCloseProject={requestCloseActiveProject}
              canPublish={canPublish}
              onPublish={() => openPublishDialog()}
              onPublishUpTo={(commit) => openPublishDialog(commit)}
              pendingVersions={pendingVersions}
              pendingVersionsError={pendingVersionsError}
              onRetryPendingVersions={() => projectPath && void checkWorkingTree(projectPath)}
              versionLines={activeSession?.versionLines ?? null}
              isLoadingVersionLines={activeSession?.isLoadingVersionLines ?? false}
              onQuickSwitchOpened={() => projectPath && void refreshVersionLines(projectPath)}
              onQuickSwitchVersionLine={(target) => {
                if (projectPath && startVersionLineOperation(projectPath)) {
                  setOverviewSwitchTarget(target);
                }
              }}
              onQuickCreateVersionLine={(forceSwitch) => {
                if (projectPath && startVersionLineOperation(projectPath)) {
                  setOverviewCreateRequest({ forceSwitch });
                }
              }}
              onGoToVersionLines={() => navigateToView("version-lines")}
            />
          ) : view === "changes" && project ? (
            <Suspense fallback={<ViewLoadingFallback />}>
              <ChangesPanel
                projectPath={project.path}
                workingTree={workingTree}
                workingTreeError={workingTreeError}
                isCheckingChanges={isCheckingChanges}
                diffCache={diffCacheRef.current}
                onRefresh={() => projectPath && void checkWorkingTree(projectPath)}
                onNavigateOverview={() => navigateToView("overview")}
                onPublishNow={() => openPublishDialog()}
                selectedPath={activeSession?.changesSelection.selectedPath ?? null}
                onSelectedPathChange={(selectedPath) =>
                  sessionsState.activeId &&
                  dispatchSessions({
                    type: "setChangesSelection",
                    id: sessionsState.activeId,
                    selection: { selectedPath, excludedPaths: activeSession?.changesSelection.excludedPaths ?? [] },
                  })
                }
                isSaveVersionOpen={saveDialogSessionId === sessionsState.activeId}
                onOpenSaveVersion={() => startSessionOperation("save")}
                onCloseSaveVersion={() => {
                  if (saveDialogSessionId) {
                    finishSessionOperation(saveDialogSessionId);
                  }
                  setSaveDialogSessionId(null);
                }}
                onSaveVersionPhaseChange={(phase) => {
                  if (saveDialogSessionId) {
                    dispatchSessions({
                      type: "setOperationPhase",
                      id: saveDialogSessionId,
                      phase,
                    });
                  }
                }}
              />
            </Suspense>
          ) : view === "version-lines" && project ? (
            <Suspense fallback={<ViewLoadingFallback />}>
              <VersionLinesPanel
                projectPath={project.path}
                snapshot={activeSession?.versionLines ?? null}
                error={activeSession?.versionLinesError ?? null}
                isLoading={activeSession?.isLoadingVersionLines ?? false}
                onRefresh={() => void refreshVersionLines(project.path)}
                onSnapshot={(snapshot) => commitVersionLines(project.path, snapshot)}
                onOperationStart={() => startVersionLineOperation(project.path)}
                onOperationFinish={() => finishSessionOperation(project.path)}
                onOperationPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
                onChanged={() => void handleVersionLineChanged(project.path)}
                onSaveVersion={() => {
                  startSessionOperation("save");
                  navigateToView("changes");
                }}
                autoOpenCreate={versionLinesAutoOpenCreate}
                onAutoOpenCreateHandled={() => setVersionLinesAutoOpenCreate(false)}
              />
            </Suspense>
          ) : (
            <SettingsPanel
              theme={theme}
              setTheme={setTheme}
              onOpenAbout={() => setIsAboutOpen(true)}
              gitDiagnostics={gitDiagnostics}
              gitUpdateStatus={gitUpdateStatus}
              onCheckGitUpdate={checkGitUpdate}
              isCheckingGitUpdate={isCheckingGitUpdate}
              onRefreshGitDiagnostics={refreshGitDiagnostics}
              isRefreshingGitDiagnostics={isRefreshingGitDiagnostics}
              reopenLastProject={reopenLastProject}
              setReopenLastProject={setReopenLastProject}
              confirmCloseProject={confirmCloseProject}
              setConfirmCloseProject={setConfirmCloseProject}
            />
          )}
        </section>
      </main>

      <CommandPalette isOpen={isPaletteOpen} onClose={closePalette} commands={commands} />

      {publishDialogSession && (
        <Suspense fallback={null}>
          <PublishDialog
            isOpen
            projectPath={publishDialogSession.project.path}
            upTo={publishUpTo ?? undefined}
            onClose={() => {
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
            }}
            onPublished={() => checkWorkingTree(publishDialogSession.project.path)}
            onPhaseChange={(phase) =>
              dispatchSessions({
                type: "setOperationPhase",
                id: publishDialogSession.id,
                phase,
              })
            }
          />
        </Suspense>
      )}

      {project && overviewSwitchTarget && (
        <Suspense fallback={null}>
          <SwitchVersionLineDialog
            isOpen
            projectPath={project.path}
            target={overviewSwitchTarget}
            onClose={() => {
              setOverviewSwitchTarget(null);
              finishSessionOperation(project.path);
            }}
            onSwitched={() => {
              setOverviewSwitchTarget(null);
              finishSessionOperation(project.path);
              void handleVersionLineChanged(project.path);
            }}
            onSaveVersion={() => {
              startSessionOperation("save");
              navigateToView("changes");
            }}
            onCreateWithWork={() => {
              if (startVersionLineOperation(project.path)) {
                setOverviewCreateRequest({ forceSwitch: false });
              }
            }}
            onPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {project && overviewCreateRequest && (
        <Suspense fallback={null}>
          <CreateVersionLineDialog
            isOpen
            projectPath={project.path}
            forceSwitch={overviewCreateRequest.forceSwitch}
            onClose={() => {
              setOverviewCreateRequest(null);
              finishSessionOperation(project.path);
            }}
            onCreated={() => {
              setOverviewCreateRequest(null);
              void handleVersionLineChanged(project.path);
              finishSessionOperation(project.path);
            }}
            onPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {isAboutOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsAboutOpen(false)}>
          <div
            ref={aboutDialogRef}
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="about-dialog__close"
              type="button"
              aria-label={t.commonClose}
              title={t.commonClose}
              onClick={() => setIsAboutOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <div className="about-dialog__mark" aria-hidden="true">{CROCODILE_MARK}</div>
            <p className="eyebrow">{t.aboutGitOdrile}</p>
            <h2 id="about-title">{t.aboutHeading}</h2>
            <p>{t.aboutDescription}</p>
            <dl className="about-details">
              <div><dt>{t.commonVersion}</dt><dd>{APP_VERSION}</dd></div>
            </dl>
            <p className="about-dialog__footer">{t.aboutFooterMadeWith}</p>
          </div>
        </div>
      )}

      {isCloseConfirmOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsCloseConfirmOpen(false)}>
          <div
            ref={closeConfirmDialogRef}
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirm-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="close-confirm-title">{t.closeConfirmTitle}</h2>
            <p>
              {closeTargetSession ? t.closeConfirmBodyNamed(closeTargetSession.project.name) : t.closeConfirmBodyGeneric}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setIsCloseConfirmOpen(false)}>
                {t.commonCancel}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => closeTargetId && performCloseSession(closeTargetId)}
              >
                {t.overviewCloseProject}
              </button>
            </div>
          </div>
        </div>
      )}

      {isOpenErrorDialogOpen && openError && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsOpenErrorDialogOpen(false)}>
          <div
            ref={openErrorDialogRef}
            className="about-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="open-error-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="open-error-title">{openErrorTitle}</h2>
            <p role="alert">{openError}</p>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={() => setIsOpenErrorDialogOpen(false)}>
                {t.commonClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

document.addEventListener("contextmenu", (event) => event.preventDefault());

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </React.StrictMode>,
  );
}

// The main window starts hidden (see `tauri.conf.json`) so it never shows a
// blank frame while the webview loads. Two rAFs guarantee the browser has
// actually painted the mounted UI before the window becomes visible.
if ("__TAURI_INTERNALS__" in window) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void invoke("show_main_window");
    });
  });
}

// Warms the lazy chunks (Changes, Publish, pending versions) once the app is
// idle after first paint, so navigating to them right after launch is a cache
// hit rather than a fresh fetch+parse. Deliberately not run before first
// paint: that would defeat the point of splitting them out in the first place.
function prefetchLazyPanels(): void {
  void import("./changes");
  void import("./publishDialog");
  void import("./pendingVersions");
  // Added in task 019: these two arrived with task 016 and were never listed
  // here, so the Version lines screen paid a chunk fetch — and showed
  // `ViewLoadingFallback` — on its first visit of every run.
  void import("./versionLinesPanel");
  void import("./versionLinesDialog");
}
