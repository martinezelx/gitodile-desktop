import React, { Suspense, lazy, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronsLeft,
  ChevronsRight,
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
  Ellipsis,
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
  FolderX,
  RotateCw,
  Info,
  Settings,
  Bug,
  Keyboard,
  Palette,
  ShieldCheck,
  ArrowRightLeft,
  FileMinus,
  FilePlus,
  Pencil,
  GitCommitHorizontal,
  GitBranchPlus,
  LifeBuoy,
  Eye,
  Save,
  Layers,
  CircleArrowUp,
} from "lucide-react";
import { LANGUAGE_NAMES, LanguageProvider, useLanguage, type Language, type LanguagePreference } from "./i18n";
import {
  CATEGORY_ORDER,
  getOrderedChangeEntries,
  getRepositoryOverviewState,
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  splitPath,
  type ChangeCategory,
  type RepositoryInfo,
  type WorkingTreeStatus,
} from "./repositoryOverview";
import { localizeAppError } from "./appError";
import {
  acceptsRepositoryInvalidation,
  invalidationNeedsSharedRefresh,
  type RepositoryInvalidation,
} from "./repositoryInvalidation";
import { autoHideScrollbarProps } from "./autoHideScrollbar";
import { createDiffCache, releaseDiffCache } from "./diffCache";
import type { PendingVersionsResult } from "./publish";
import type { VersionLine, VersionLinesSnapshot } from "./versionLines";
import { useModalFocus } from "./modalFocus";
import { TooltipHost } from "./tooltip";
import { LoadingBar } from "./loadingBar";
import {
  EMPTY_CHANGES_SELECTION,
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  hasUnsettledOperation,
  initialProjectSessionsState,
  projectSessionsReducer,
  projectSessionsStateToStored,
  readStoredProjects,
  repositorySessionEpoch,
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
import {
  ChangesPanel,
  KeepAliveScreens,
  NAV_DESTINATIONS,
  SwitchMeasurementRoot,
  VersionLinesPanel,
  markScreenSwitchIntent,
  prefetchScreenChunks,
  screenRequiresProject,
  type ScreenId,
} from "./screens";
import "./styles.css";

// Lazily loaded: none of these are needed for the first paint (the Overview
// screen with no project open), and ChangesPanel/PublishDialog/PendingVersions
// pull in the file-type icon set (~70 SVGs). Deferring them keeps the initial
// bundle — and therefore first-paint time — small. The two screen panels live
// in `screens.tsx` next to their registry entries; these are the dialogs,
// which are not screens.
const PublishDialog = lazy(() => import("./publishDialog").then((m) => ({ default: m.PublishDialog })));
const PendingVersionsSection = lazy(() =>
  import("./pendingVersions").then((m) => ({ default: m.PendingVersionsSection })),
);
const CreateVersionLineDialog = lazy(() =>
  import("./versionLinesDialog").then((m) => ({ default: m.CreateVersionLineDialog })),
);
const SwitchVersionLineDialog = lazy(() =>
  import("./versionLinesDialog").then((m) => ({ default: m.SwitchVersionLineDialog })),
);

type ThemePreference = "system" | "light" | "dark";
/** Kept as a local alias so the many `View` references below stay readable;
 * `screens.tsx` owns the definition and the registry that lists them. */
type View = ScreenId;

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
const ISSUES_URL = "https://github.com/martinezelx/project-gitodrile/issues/new";
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";

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

// Screen icons live in the nav registry (`screens.tsx`); these two belong to
// the sidebar chrome, which is not a destination.
const NAV_ICONS = {
  collapse: <ChevronsLeft />,
  expand: <ChevronsRight />,
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
  const { t } = useLanguage();
  return <LoadingBar label={t.commonLoading} />;
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
 * Titlebar overflow menu: File, Window, and Help groups, separated by thin
 * dividers rather than text headings — closer to a native app menu than a
 * labelled dropdown. The button + popover pattern (closing on
 * Escape/outside click) can take more groups later without a rewrite.
 */
export function TitlebarMenu({
  onOpenAbout,
  onOpenProject,
  onCloseProject,
  onOpenSettings,
  onOpenShortcuts,
  hasProject,
  isOpeningProject,
  canReloadWindow,
}: {
  onOpenAbout: () => void;
  onOpenProject: () => void;
  onCloseProject: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  hasProject: boolean;
  isOpeningProject: boolean;
  canReloadWindow: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpenRef = useRef<"first" | "last">("first");

  const openMenu = (focus: "first" | "last" = "first"): void => {
    focusOnOpenRef.current = focus;
    setIsOpen(true);
  };

  const closeMenu = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const runMenuAction = (action: () => void): void => {
    // Restore focus before mounting a dialog. `useModalFocus` can then retain
    // the real trigger instead of capturing `<body>` after this menu unmounts.
    closeMenu(true);
    action();
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items?.length) return;
    items[focusOnOpenRef.current === "last" ? items.length - 1 : 0]?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      closeMenu(true);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      // A menu is a single tab stop. Let the browser move to the next control
      // while removing the popup from the accessibility tree.
      setIsOpen(false);
      return;
    } else {
      return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div className="titlebar-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="titlebar-icon-button"
        type="button"
        aria-label={t.titlebarMoreActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeMenu(true) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="titlebar-menu__list"
          role="menu"
          aria-label={t.titlebarMoreActions}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={isOpeningProject}
            onClick={() => {
              runMenuAction(onOpenProject);
            }}
          >
            <FolderOpen aria-hidden="true" />
            <span>{isOpeningProject ? t.overviewOpening : t.titlebarOpenProject}</span>
          </button>
          {hasProject && (
            <button
              className="titlebar-menu__item"
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                runMenuAction(onCloseProject);
              }}
            >
              <FolderX aria-hidden="true" />
              <span>{t.overviewCloseProject}</span>
            </button>
          )}
          <div className="titlebar-menu__divider" role="separator" />
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              runMenuAction(onOpenSettings);
            }}
          >
            <Settings aria-hidden="true" />
            <span>{t.navSettings}</span>
          </button>
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={!canReloadWindow}
            aria-label={canReloadWindow ? t.titlebarReloadWindow : `${t.titlebarReloadWindow}. ${t.titlebarReloadBlocked}`}
            data-tooltip={canReloadWindow ? undefined : t.titlebarReloadBlocked}
            onClick={() => {
              if (!canReloadWindow) return;
              runMenuAction(() => window.location.reload());
            }}
          >
            <RotateCw aria-hidden="true" />
            <span>{t.titlebarReloadWindow}</span>
          </button>
          <div className="titlebar-menu__divider" role="separator" />
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              runMenuAction(onOpenShortcuts);
            }}
          >
            <Keyboard aria-hidden="true" />
            <span>{t.titlebarKeyboardShortcuts}</span>
          </button>
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled
            aria-label={t.titlebarReportIssueTitle}
            data-tooltip={t.titlebarReportIssueTitle}
            onClick={() => {
              runMenuAction(() => void openUrl(ISSUES_URL));
            }}
          >
            <Bug aria-hidden="true" />
            <span>{t.titlebarReportIssue}</span>
          </button>
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              runMenuAction(onOpenAbout);
            }}
          >
            <Info aria-hidden="true" />
            <span>{t.aboutGitOdrile}</span>
          </button>
        </div>
      )}
    </div>
  );
}

const FOLDER_ICON = <FolderOpen />;

/** Truncated paths stay fully available: readable on hover/AT, and copyable. */
export function ProjectPath({ path, onCopyError }: { path: string; onCopyError: () => void }): React.JSX.Element {
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
      onCopyError();
    }
  };

  return (
    <p className="project-path">
      <span className="project-path__value" data-tooltip={path}>
        {path}
      </span>
      <button
        className="project-path__copy"
        type="button"
        onClick={() => void copyPath()}
        aria-label={t.overviewCopyPath}
        data-tooltip={wasCopied ? t.overviewPathCopied : t.overviewCopyPath}
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

/** Category glyphs stay local because they are also the immediate Suspense
 * fallback for file-type icons. The full vscode-icons catalog is loaded only
 * when an Overview preview actually has files, so it does not block the app's
 * first paint. */
const PREVIEW_CATEGORY_ICONS: Record<ChangeCategory, React.JSX.Element> = {
  changed: <Pencil aria-hidden="true" />,
  new: <FilePlus aria-hidden="true" />,
  deleted: <FileMinus aria-hidden="true" />,
  renamed: <ArrowRightLeft aria-hidden="true" />,
  conflicted: <TriangleAlert aria-hidden="true" />,
};

const OverviewFileTypeIcon = lazy(async () => {
  const { getFileTypeIcon } = await import("./fileIcons");
  return {
    default: function OverviewFileTypeIconComponent({ path }: { path: string }): React.JSX.Element {
      const FileTypeIcon = getFileTypeIcon(path);
      return <FileTypeIcon className="changes-preview__file-type-icon" />;
    },
  };
});

/** Column headers for the grouped preview below — distinct from
 * `CATEGORY_LABEL_KEYS` above, which phrases the same categories as the
 * inline "N edited" chips in the status card's own message. */
const CATEGORY_COLUMN_LABEL_KEYS = {
  changed: "overviewCategoryEdited",
  new: "overviewCategoryAdded",
  deleted: "overviewCategoryDeleted",
  renamed: "overviewCategoryRenamed",
  conflicted: "overviewCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof ReturnType<typeof useLanguage>["t"]>;

/** How many files each category column names before deferring to the Changes
 * screen. Per category, not overall: a project with one edited file and nine
 * new ones should not spend its whole budget on the edited column having
 * nothing left to show for "new". Small on purpose: categories sit side by
 * side (see `.changes-preview__groups`), so a short, fixed cap is what keeps
 * every column's height in the same ballpark regardless of which category
 * happens to have the most files. */
const CHANGES_PREVIEW_CATEGORY_LIMIT = 4;

/** A read-only sample of the working tree, grouped into one column per
 * category — the same grouping the status chips above already summarize, so
 * this is where "7 edited, 11 new" turns into which 7 and which 11. Each file
 * is a shortcut into the Changes screen with that file already selected. */
function OverviewChangesPreview({
  workingTree,
  onOpenFile,
  onSeeAll,
}: {
  workingTree: WorkingTreeStatus;
  onOpenFile: (path: string) => void;
  onSeeAll: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    // `entries` can already be a backend-truncated sample of a very large
    // status; `counts` never is, so the column header and the "N more" count
    // below both read from `counts` and stay honest either way.
    entries: workingTree.entries.filter((entry) => entry.category === category),
    count: workingTree.counts[category],
  })).filter((group) => group.count > 0);

  return (
    <div className="changes-preview">
      <div className="changes-preview__groups">
        {groups.map(({ category, entries, count }) => {
          const shown = entries.slice(0, CHANGES_PREVIEW_CATEGORY_LIMIT);
          const remaining = count - shown.length;
          return (
            <div className={`changes-preview__group changes-preview__group--${category}`} key={category}>
              <h3 className="changes-preview__group-title">
                <span className="changes-preview__group-icon" aria-hidden="true">
                  {PREVIEW_CATEGORY_ICONS[category]}
                </span>
                {t[CATEGORY_COLUMN_LABEL_KEYS[category]](count)}
              </h3>
              <ul className="changes-preview__list" aria-label={t[CATEGORY_COLUMN_LABEL_KEYS[category]](count)}>
                {shown.map((entry) => {
                  // Name only — the containing folder is one hover (the
                  // tooltip) or one click (Changes, via `onOpenFile`) away,
                  // not printed on every row.
                  const { name } = splitPath(entry.path);
                  const fullPath =
                    entry.category === "renamed" && entry.originalPath
                      ? `${entry.originalPath} → ${entry.path}`
                      : entry.path;
                  return (
                    <li key={entry.path}>
                      <button
                        className="changes-preview__item"
                        type="button"
                        onClick={() => onOpenFile(entry.path)}
                        aria-label={t.overviewChangesPreviewOpenFile(fullPath)}
                        data-tooltip={fullPath}
                      >
                        <span className="changes-preview__icon" aria-hidden="true">
                          <Suspense fallback={PREVIEW_CATEGORY_ICONS[category]}>
                            <OverviewFileTypeIcon path={entry.path} />
                          </Suspense>
                        </span>
                        <span className="changes-preview__name">{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {remaining > 0 && (
                <button className="changes-preview__more" type="button" onClick={onSeeAll}>
                  {t.overviewChangesPreviewMore(remaining)}
                  <ChevronRight aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The slot a not-yet-built Overview summary will occupy, shown greyed out so
 * the screen's final shape is visible while the feature is missing. It shows
 * *no data at all* — placeholder bars, never plausible-looking numbers — so
 * there is no moment where the Overview appears to be reporting on a
 * repository it cannot read yet. Paired with the sidebar's disabled History
 * and Recovery entries; both go away together when the screens land. */
function OverviewPlaceholderCard({
  icon,
  title,
  description,
  rows,
}: {
  icon: React.JSX.Element;
  title: string;
  description: string;
  /** How many blocked-out lines to reserve, matching the shape the real
   * summary will have (History lists versions; Recovery lists one action). */
  rows: number;
}): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <section className="overview-placeholder" aria-label={`${title} — ${t.overviewComingSoonBadge}`}>
      <div className="overview-placeholder__head">
        <div className="overview-placeholder__icon" aria-hidden="true">
          {icon}
        </div>
        <div className="overview-placeholder__heading">
          <h2>{title}</h2>
          <span className="overview-placeholder__badge">{t.overviewComingSoonBadge}</span>
        </div>
      </div>
      <p className="overview-placeholder__description">{description}</p>
      <div className="overview-placeholder__rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <span key={index} className="overview-placeholder__row" />
        ))}
      </div>
    </section>
  );
}

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
  /** Fired each time the menu opens, so the caller can revalidate the shared
   * snapshot behind it. The menu never waits on that: it renders whatever is
   * cached and swaps in the newer answer if one arrives. */
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
    <div className="version-lines-quick-switch" ref={containerRef}>
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
          <GitBranch aria-hidden="true" className="version-line-selector__icon" />
          <span className="version-line-selector__value">{currentValue}</span>
          <ChevronDown aria-hidden="true" className="version-line-selector__chevron" />
        </button>
      ) : (
        <span className="version-line-selector version-line-selector--static">
          <GitBranch aria-hidden="true" className="version-line-selector__icon" />
          <span className="version-line-selector__value">{currentValue}</span>
        </span>
      )}
      {/* Icon-only: the branch-with-a-plus glyph carries the meaning, and the
          name stays reachable as both the accessible name and the tooltip. A
          text button here would be as wide as the line name beside it, which
          reads as the more important of the two. */}
      <button
        className="secondary-button version-lines-quick-switch__create"
        type="button"
        onClick={onCreate}
        aria-label={t.overviewNewVersionLine}
        data-tooltip={t.overviewNewVersionLine}
      >
        <GitBranchPlus aria-hidden="true" />
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
  canPublish,
  onPublish,
  onPublishUpTo,
  pendingVersions,
  pendingVersionsError,
  onRetryPendingVersions,
  versionLines,
  isLoadingVersionLines,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onCopyPathError,
  onOpenSaveVersion,
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
  /** Opens the Changes screen. With a path, that file is selected first, so
   * the Overview preview is a shortcut *to a file*, not just to the screen. */
  onReviewChanges: (path?: string) => void;
  onOpenProject: () => void;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  onRetryPendingVersions: () => void;
  /** The project session's cached branch inventory, shared with the Version
   * lines screen so Overview's quick-switch menu opens instantly instead of
   * reading branches again every time (task 019). */
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onPublishUpTo: (commit: string) => void;
  onQuickSwitchVersionLine: (target: string) => void;
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
  /** Opens the save-version flow. Overview has no file-selection UI of its
   * own to drive `SaveVersionDialog`'s exclusion checkboxes, so — like
   * `VersionLinesPanel` and `SwitchVersionLineDialog`'s own `onSaveVersion`
   * — this is expected to navigate to Changes and open the dialog there,
   * reusing its one existing implementation rather than a second copy of it. */
  onOpenSaveVersion: () => void;
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
            <ProjectPath path={project.path} onCopyError={onCopyPathError} />
            {overview.wasOpenedFromNestedFolder && (
              <p className="project-overview__nested">
                {t.overviewOpenedFrom}
                <span data-tooltip={project.selectedPath}>{project.selectedPath}</span>
              </p>
            )}
          </div>
          {/* Fills the header's empty right half, opposite the identity it
              qualifies: the project, the line its new work goes to, and the
              two counts that summarize everything below — a scannable
              breadcrumb rather than a boxed card, so it reads as *about* the
              project instead of as one more panel competing with the status
              card underneath it. */}
          <div className="overview-meta" role="group" aria-label={t.overviewCurrentVersionLine}>
            <span className="overview-meta__branch">
              {overview.isUnborn ? (
                <span className="overview-meta__branch-note">
                  {/* Icon, not the word "Branch" — GitHub/GitLab both drop
                      the label too, since a branch glyph next to a value
                      reads as self-explanatory. `aria-hidden` on the glyph,
                      the group's own `aria-label` still carries it for a
                      screen reader. Lives inside `.version-line-selector`
                      itself in the switchable case below, so there is only
                      ever one branch glyph in this row, not two flanking it. */}
                  <GitBranch aria-hidden="true" className="overview-meta__branch-icon" />
                  <span className="version-line-card__value">{versionValue}</span>
                  {t[overview.versionDescriptionKey]}
                </span>
              ) : (
                <OverviewVersionLineQuickActions
                  snapshot={versionLines}
                  isLoadingSnapshot={isLoadingVersionLines}
                  currentValue={versionValue}
                  canSwitch={!overview.isDetached}
                  onSwitch={onQuickSwitchVersionLine}
                  onCreate={() => onQuickCreateVersionLine(overview.isDetached)}
                  onSeeAll={onGoToVersionLines}
                />
              )}
            </span>
            {pendingVersions.totalCount > 0 && (
              <>
                <span className="overview-meta__sep" aria-hidden="true">
                  ·
                </span>
                {/* Emphasized, not a link: what makes it actionable is the
                    "Publish all" button on the saved-versions section
                    itself, already visible below without any navigation. */}
                <span className="overview-meta__stat overview-meta__stat--accent">
                  {t.overviewVersionsAhead(pendingVersions.totalCount)}
                </span>
              </>
            )}
            {/* Working-change count deliberately left out — the status card
                right below already opens with it ("N files changed" /
                the breakdown chips), so repeating it here was the same fact
                twice with nothing new to add. */}
          </div>
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
                    className={`status-breakdown__item status-breakdown__item--${item.category}`}
                  >
                    {t[CATEGORY_LABEL_KEYS[item.category]](item.count)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="project-hero__actions">
            {/* A quiet, secondary corner action — re-reading the working tree
                isn't the thing this card wants you to do next, so it no longer
                competes with Review/Save for primary-button weight. Publishing
                moved out entirely: it now lives with the saved versions it
                actually publishes (`PendingVersionsSection`'s own "Publish
                all"), not with the unsaved files above. */}
            <button
              className="ghost-button project-hero__refresh"
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
            <div className="project-hero__buttons">
              <button
                className="secondary-button project-hero__action"
                type="button"
                onClick={() => onReviewChanges()}
              >
                <Eye aria-hidden="true" />
                {t.overviewReviewChanges}
              </button>
              <button
                className="primary-button project-hero__action"
                type="button"
                onClick={onOpenSaveVersion}
                disabled={!workingTree || workingTree.counts.total === 0 || isCheckingChanges}
              >
                <Save aria-hidden="true" />
                {t.overviewSaveVersion}
              </button>
            </div>
          </div>
          {/* Named files only once a check has actually produced them: a stale
              or in-flight status must not put a file list under a headline
              that no longer describes it. */}
          {workingTree && !isLoading && workingTree.counts.total > 0 && (
            <OverviewChangesPreview
              workingTree={workingTree}
              onOpenFile={(path) => onReviewChanges(path)}
              onSeeAll={() => onReviewChanges()}
            />
          )}
          {/* The other half of "what is waiting on you": work already saved
              but not yet published. Publishing lives here — as "Publish all"
              — rather than in the actions above: you publish saved versions,
              not raw working-tree edits, so the action belongs next to the
              versions it acts on. */}
          {(pendingVersions.totalCount > 0 || pendingVersionsError) && project && (
            <Suspense fallback={null}>
              <PendingVersionsSection
                key={project.path}
                projectPath={project.path}
                result={pendingVersions}
                error={pendingVersionsError}
                onRetry={onRetryPendingVersions}
                onPublishUpTo={onPublishUpTo}
                canPublish={canPublish}
                onPublish={onPublish}
              />
            </Suspense>
          )}
          <StatusAnnouncement isBusy={isCheckingChanges} message={`${heroHeadline}. ${heroMessage}`} />
        </section>

        {/* Last, and in sidebar order: the summaries for the two screens that
            do not exist yet. Side by side on a wide window so they read as one
            "not built yet" band rather than two more full-width cards
            competing with the two that work. */}
        <div className="overview-placeholders">
          <OverviewPlaceholderCard
            icon={<GitCommitHorizontal />}
            title={t.overviewHistoryPreviewTitle}
            description={t.overviewHistoryPreviewDescription}
            rows={3}
          />
          <OverviewPlaceholderCard
            icon={<LifeBuoy />}
            title={t.overviewRecoveryPreviewTitle}
            description={t.overviewRecoveryPreviewDescription}
            rows={3}
          />
        </div>
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
        <button className="secondary-button" type="button" disabled data-tooltip={t.overviewCloneComingSoonTitle}>
          {t.overviewCloneFromGithub}
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  theme,
  setTheme,
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
  const [activeSection, setActiveSection] = useState<"general" | "appearance" | "git" | "safety">("general");

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

  /* One line instead of a stack of five conditionally rendered hints. Every
     update state — never checked, checking, up to date, update waiting,
     checker broken — is the same shape (icon + sentence) with a tone, so the
     row's height never jumps as the state changes and the icon, not the
     wording, is what tells them apart at a glance. */
  const gitUpdateLine: { tone: string; icon: React.JSX.Element; message: string } | null =
    isCheckingGitUpdate || gitUpdateStatus?.state === "checking"
      ? { tone: "progress", icon: <LoaderCircle aria-hidden="true" className="icon--spinning" />, message: t.gitUpdateChecking }
      : gitUpdateStatus === null
        ? { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.gitUpdateNotChecked }
        : gitUpdateStatus.state === "up_to_date"
          ? { tone: "success", icon: <CheckCircle2 aria-hidden="true" />, message: t.gitUpdateUpToDate }
          : gitUpdateStatus.state === "update_available"
            ? { tone: "accent", icon: <CircleArrowUp aria-hidden="true" />, message: t.settingsGeneralUpdateAvailable }
            : gitUpdateStatus.state === "unavailable"
              ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckerUnavailable }
              : gitUpdateStatus.state === "failed"
                ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckFailed }
                : gitUpdateStatus.state === "timed_out"
                  ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckTimedOut }
                  : null;

  const sections = [
    { id: "general", label: t.settingsGeneralTitle, icon: <Settings /> },
    { id: "appearance", label: t.settingsAppearanceTitle, icon: <Palette /> },
    { id: "git", label: t.settingsGitTitle, icon: <GitBranch /> },
    { id: "safety", label: t.settingsSafetyTitle, icon: <ShieldCheck /> },
  ] as const;

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t.settingsSectionsAriaLabel}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-nav__item${activeSection === section.id ? " settings-nav__item--active" : ""}`}
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => setActiveSection(section.id)}
          >
            <span aria-hidden="true">{section.icon}</span>
            {section.label}
          </button>
        ))}
      </nav>
      <div className="settings-view">
      {activeSection === "appearance" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsAppearanceTitle}</h2>
          <p>{t.settingsAppearanceDescription}</p>
        </div>
        <div className="settings-groups">
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.themeAriaLabel}</h3>
            </header>
            <div className="settings-group__body">
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
            </div>
          </section>
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.settingsLanguageTitle}</h3>
              <p>{t.settingsLanguageDescription}</p>
            </header>
            <div className="settings-group__body">
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
            </div>
          </section>
        </div>
      </section>
      )}

      {activeSection === "general" && (
        <>
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGeneralTitle}</h2>
          <p>{t.settingsGeneralDescription}</p>
        </div>
        <div className="settings-groups">
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.settingsStartupTitle}</h3>
              <p>{t.settingsStartupDescription}</p>
            </header>
            <div className="settings-group__body">
              <div className="settings-row">
                <div>
                  <strong>{t.startupReopenLabel}</strong>
                  <p>{t.startupReopenDescription}</p>
                </div>
                <ToggleSwitch label={t.startupReopenLabel} checked={reopenLastProject} onChange={setReopenLastProject} />
              </div>
            </div>
          </section>
        </div>
      </section>
        </>
      )}

      {activeSection === "git" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGitTitle}</h2>
          <p>{t.settingsGitDescription}</p>
        </div>
        <div className="settings-groups">
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.settingsGitInstallationTitle}</h3>
            <p>{t.settingsGitInstallationDescription}</p>
          </header>
          <div className="settings-group__body">
        <div className="settings-row">
          <div className="git-install">
            {gitDiagnostics === null && (
              <p className="git-install__status git-install__status--progress">
                <LoaderCircle aria-hidden="true" className="icon--spinning" />
                <span>{t.settingsGeneralChecking}</span>
              </p>
            )}
            {gitDiagnostics?.state === "available" && (
              <>
                {/* The version is the fact this row exists to report, so it
                    gets the label + monospace value treatment rather than
                    sitting as a bare paragraph indistinguishable from the
                    hints under it. */}
                <p className="git-install__version">
                  <span className="git-install__version-label">{t.settingsGitInstalledVersionLabel}</span>
                  <span className="git-install__version-value">{gitDiagnostics.version}</span>
                </p>
                {gitUpdateLine && (
                  <p className={`git-install__status git-install__status--${gitUpdateLine.tone}`} role="status">
                    {gitUpdateLine.icon}
                    <span>{gitUpdateLine.message}</span>
                  </p>
                )}
              </>
            )}
            {gitDiagnostics?.state === "missing" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitMissing}</span>
              </p>
            )}
            {gitDiagnostics?.state === "unusable" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitUnusable}</span>
              </p>
            )}
            {gitDiagnostics?.state === "check_failed" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitCheckFailed}</span>
              </p>
            )}
            {gitActionMessage && (
              <p className="git-install__status git-install__status--neutral" role="status">
                <Info aria-hidden="true" />
                <span>{gitActionMessage}</span>
              </p>
            )}
          </div>
          <div className="settings-row__actions">
            {gitDiagnostics?.state === "missing" && (
              <button className="primary-button" type="button" disabled={isStartingGitInstallation} onClick={() => void handleInstallGit()}>
                {isStartingGitInstallation ? t.gitStartingInstaller : t.settingsGeneralInstallGit}
              </button>
            )}
            {gitDiagnostics?.state !== "available" && (
              <button className="secondary-button" type="button" disabled={isRefreshingGitDiagnostics} onClick={() => void onRefreshGitDiagnostics()}>
                {isRefreshingGitDiagnostics ? t.settingsGeneralChecking : t.settingsGeneralCheckAgain}
              </button>
            )}
            {gitDiagnostics?.state === "available" && (
              <button className="secondary-button" type="button" disabled={isCheckingGitUpdate} onClick={() => void onCheckGitUpdate()}>
                {isCheckingGitUpdate ? t.gitUpdateChecking : t.gitUpdateCheck}
              </button>
            )}
            {gitDiagnostics?.state === "available" && gitUpdateStatus?.state === "update_available" && (
              <button className="primary-button" type="button" disabled={isStartingGitUpdate} onClick={() => void handleUpdateGit()}>
                {isStartingGitUpdate ? t.gitUpdateStarting : t.settingsGeneralUpdate}
              </button>
            )}
          </div>
        </div>
          </div>
        </section>
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.settingsIdentityTitle}</h3>
            <p>{t.settingsIdentityDescription}</p>
          </header>
          <div className="settings-group__body">
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
          </div>
        </section>
        </div>
      </section>
      )}

      {activeSection === "safety" && (
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
      )}

      </div>
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
  const versionLinesRequestsRef = useRef<
    Record<string, { generation: number; promise: Promise<void> }>
  >({});
  // Watch events that arrive while a mutation owns the working tree are not
  // discarded. They are coalesced here and replayed when the dialog closes.
  const pendingWatchRefreshesRef = useRef<Record<string, { repositoryStateChanged: boolean }>>({});
  const watcherSequencesRef = useRef<Record<string, number>>({});
  const watchedSessionsRef = useRef<Record<string, string>>({});
  // Read diffs, kept per project across screen changes. Owned here rather
  // than by `ChangesPanel` so leaving Changes and coming back is a cache hit
  // (see task 019); entries are dropped when their session closes.
  const diffCacheRef = useRef(createDiffCache());
  const activeSession = sessionsState.activeId ? sessionsState.byId[sessionsState.activeId] : null;
  const project = activeSession?.project ?? null;
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const workingTreeCheckedAt = activeSession?.workingTreeCheckedAt ?? null;
  const pendingVersions = activeSession?.pendingVersions ?? EMPTY_PENDING_VERSIONS;
  const pendingVersionsError = activeSession?.pendingVersionsError ?? null;
  const [projectAnnouncement, setProjectAnnouncement] = useState("");
  const [storedProjectsOnLaunch] = useState(readStoredProjects);
  const [hasCompletedSessionRestore, setHasCompletedSessionRestore] = useState(false);

  const navigateToView = (next: View): void => {
    if (next === view) {
      return;
    }
    markScreenSwitchIntent(view, next);
    if (sessionsState.activeId) {
      dispatchSessions({ type: "navigate", id: sessionsState.activeId, view: next });
    }
    setView(next);
  };

  const goBack = (): void => {
    if (!activeSession || activeSession.viewHistoryIndex === 0) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex - 1;
    dispatchSessions({ type: "goBack", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const goForward = (): void => {
    if (
      !activeSession ||
      activeSession.viewHistoryIndex >= activeSession.viewHistory.length - 1
    ) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex + 1;
    dispatchSessions({ type: "goForward", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const canGoBack = Boolean(activeSession && activeSession.viewHistoryIndex > 0);
  const canGoForward =
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
    isSettingsOpen ||
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
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const aboutDialogRef = useRef<HTMLDivElement>(null);
  const closeConfirmDialogRef = useRef<HTMLDivElement>(null);
  const openErrorDialogRef = useRef<HTMLDivElement>(null);
  const shortcutsDialogRef = useRef<HTMLDivElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const palettePreviouslyFocusedRef = useRef<HTMLElement | null>(null);

  useModalFocus(isSettingsOpen, settingsDialogRef, setIsSettingsOpen);
  useModalFocus(isAboutOpen, aboutDialogRef, setIsAboutOpen);
  useModalFocus(isCloseConfirmOpen, closeConfirmDialogRef, setIsCloseConfirmOpen);
  useModalFocus(isOpenErrorDialogOpen, openErrorDialogRef, setIsOpenErrorDialogOpen);
  useModalFocus(isShortcutsOpen, shortcutsDialogRef, setIsShortcutsOpen);

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

  const checkWorkingTree = async (path: string, requestedEpoch?: string): Promise<void> => {
    const epoch = requestedEpoch ?? sessionsState.byId[path]?.epoch;
    if (!epoch) {
      return;
    }
    const generation = (statusGenerationsRef.current[path] ?? 0) + 1;
    statusGenerationsRef.current[path] = generation;
    dispatchSessions({ type: "startStatusCheck", id: path, generation, epoch });
    try {
      const status = await invoke<WorkingTreeStatus>("read_working_tree_status", { path, sessionEpoch: epoch });
      dispatchSessions({
        type: "applyWorkingTree",
        id: path,
        generation,
        epoch,
        workingTree: status,
        checkedAt: Date.now(),
      });
    } catch (error) {
      // Keep the last known status visible; the card reports the failure only
      // when it has nothing truthful to show instead.
      dispatchSessions({
        type: "applyWorkingTreeError",
        id: path,
        generation,
        epoch,
        error: localizeAppError(error, t, t.statusCouldntCheck),
      });
    }
    // Independent of the status outcome above: a failure here must never
    // blank out or corrupt the primary working-tree status. Guarded by the
    // same generation as the status call above so a superseded refresh's
    // pending-versions result can't land after a newer one either.
    try {
      const result = await invoke<PendingVersionsResult>("list_unpublished_versions", { path, sessionEpoch: epoch });
      dispatchSessions({ type: "applyPendingVersions", id: path, generation, epoch, result });
    } catch (error) {
      dispatchSessions({
        type: "applyPendingVersionsError",
        id: path,
        generation,
        epoch,
        error: localizeAppError(error, t, t.overviewPendingVersionsError),
      });
    }
  };

  /** Re-reads the branch inventory into the project's session. Concurrent
   * calls for the same project share one request. A cached refresh does not
   * publish a loading state, and an unchanged answer is ignored by the reducer,
   * so repository-watch events cannot make the visible screen churn. */
  const refreshVersionLines = (path: string): Promise<void> => {
    const epoch = sessionsState.byId[path]?.epoch;
    if (!epoch) {
      return Promise.resolve();
    }
    const inFlight = versionLinesRequestsRef.current[path];
    if (inFlight) {
      return inFlight.promise;
    }
    const generation = (versionLinesGenerationsRef.current[path] ?? 0) + 1;
    versionLinesGenerationsRef.current[path] = generation;
    if (!sessionsState.byId[path]?.versionLines) {
      dispatchSessions({ type: "startVersionLinesLoad", id: path });
    }
    const request = invoke<VersionLinesSnapshot>("get_version_lines", { path, sessionEpoch: epoch })
      .then((snapshot) => {
        if (versionLinesGenerationsRef.current[path] === generation) {
          dispatchSessions({ type: "applyVersionLines", id: path, epoch, snapshot });
        }
      })
      .catch((error: unknown) => {
        if (versionLinesGenerationsRef.current[path] !== generation) {
          return;
        }
        dispatchSessions({
          type: "applyVersionLinesError",
          id: path,
          epoch,
          error: localizeAppError(error, t, t.versionLinesErrorLoading),
        });
      })
      .finally(() => {
        // A close/reopen or mutation may have invalidated this request and
        // installed a newer one for the same canonical path. Only the entry
        // that still owns this generation may clear itself.
        if (versionLinesRequestsRef.current[path]?.generation === generation) {
          delete versionLinesRequestsRef.current[path];
        }
      });
    versionLinesRequestsRef.current[path] = { generation, promise: request };
    return request;
  };

  /** Stores a snapshot a mutation already returned, skipping a re-read. The
   * generation bump makes an older in-flight discovery response harmless. */
  const commitVersionLines = (path: string, snapshot: VersionLinesSnapshot): void => {
    const epoch = sessionsState.byId[path]?.epoch;
    if (!epoch) {
      return;
    }
    const generation = (versionLinesGenerationsRef.current[path] ?? 0) + 1;
    versionLinesGenerationsRef.current[path] = generation;
    delete versionLinesRequestsRef.current[path];
    dispatchSessions({ type: "applyVersionLines", id: path, epoch, snapshot });
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
    delete pendingWatchRefreshesRef.current[path];
    try {
      const info = await invoke<RepositoryInfo>("open_repository", {
        path,
        sessionEpoch: sessionsState.byId[path]?.epoch,
      });
      dispatchSessions({ type: "open", project: info });
    } catch {
      // Best-effort: the working-tree refresh below still runs, and the
      // next status check will eventually re-derive the branch too.
    }
    dispatchSessions({ type: "setChangesSelection", id: path, selection: EMPTY_CHANGES_SELECTION });
    await checkWorkingTree(path);
  };

  const refreshRepositoryState = async (path: string): Promise<void> => {
    try {
      const info = await invoke<RepositoryInfo>("open_repository", {
        path,
        sessionEpoch: sessionsState.byId[path]?.epoch,
      });
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

  // Switching or opening a project moves the visible screen to whatever that
  // session was last showing — unless the user is currently in Settings,
  // which is application-wide and stays exactly where it is regardless of
  // which project is active underneath it.
  const syncViewToSession = (targetLastView: ProjectView): void => {
    if (view !== targetLastView) {
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
        void checkWorkingTree(info.path, repositorySessionEpoch(info));
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
          void checkWorkingTree(info.path, repositorySessionEpoch(info));
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

  // Typed watcher invalidations are scoped to one Rust-issued session epoch
  // and strictly increasing sequence. The listener lives once; this ref keeps
  // it pointed at the current immutable session state.
  const handleRepositoryChangedRef = useRef<(event: RepositoryInvalidation) => void>(() => {});
  handleRepositoryChangedRef.current = (event: RepositoryInvalidation) => {
    const path = event.projectId;
    const session = sessionsState.byId[path];
    const sequenceKey = `${path}\0${event.sessionEpoch}`;
    const previousSequence = watcherSequencesRef.current[sequenceKey] ?? 0;
    if (!acceptsRepositoryInvalidation(session, event, previousSequence)) {
      return;
    }
    watcherSequencesRef.current[sequenceKey] = event.sequence;
    const repositoryStateChanged = invalidationNeedsSharedRefresh(event.kind);
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
    void listen<RepositoryInvalidation>("repository-changed", (event) => {
      handleRepositoryChangedRef.current(event.payload);
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

  // Warms every registered screen's chunks once the app is idle after first
  // paint, so navigating to one right after launch is a cache hit rather than
  // a fetch+parse. Deliberately not run before first paint: that would defeat
  // the point of splitting them out. The list itself lives with the screen
  // registry, so a new screen cannot ship without one (task 021).
  //
  // Module-level idle work outlived jsdom test environments and left lazy
  // imports running after teardown. Owning it here gives React a real cleanup
  // point while preserving the same after-first-paint scheduling in the app.
  useEffect(() => scheduleIdleTask(prefetchScreenChunks), []);

  // Every open worktree is registered after startup restore. Rust coalesces
  // shared common-Git-dir signals and fans them to related worktrees exactly
  // once; worktree-only invalidations stay isolated.
  const watcherSessionKey = sessionsState.order
    .map((id) => `${id}\0${sessionsState.byId[id]?.epoch ?? ""}`)
    .join("\u0001");
  useEffect(() => {
    if (!hasCompletedSessionRestore || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const desired = new Map(sessionsState.order.map((id) => [id, sessionsState.byId[id]?.epoch]));
    for (const [path, epoch] of Object.entries(watchedSessionsRef.current)) {
      if (desired.get(path) !== epoch) {
        void invoke("unwatch_repository", { path, sessionEpoch: epoch }).catch(() => {});
        delete watchedSessionsRef.current[path];
      }
    }
    for (const [path, epoch] of desired) {
      if (!epoch || watchedSessionsRef.current[path] === epoch) {
        continue;
      }
      watchedSessionsRef.current[path] = epoch;
      void invoke<boolean>("watch_repository", { path, sessionEpoch: epoch })
        .then((watching) => {
          if (!watching && watchedSessionsRef.current[path] === epoch) {
            delete watchedSessionsRef.current[path];
          }
        })
        .catch(() => {
          if (watchedSessionsRef.current[path] === epoch) {
            delete watchedSessionsRef.current[path];
          }
        });
    }
  }, [hasCompletedSessionRestore, watcherSessionKey]);

  // Refreshes once when a project becomes active, not whenever a screen is
  // visited. This covers startup and changes made while another project was
  // active; repository-watch events keep the active session fresh afterward.
  // Deferred so startup and the project-switch frame remain uncontested.
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath) {
      return undefined;
    }
    return scheduleIdleTask(() => {
      void refreshVersionLines(projectPath);
    });
  }, [hasCompletedSessionRestore, projectPath]);

  // Some screens only exist for an opened project; if the project closes
  // while one is showing, leave immediately rather than rendering it against
  // a project that is no longer open. Which screens those are comes from the
  // registry, so a new project-only screen is covered by declaring itself one.
  useEffect(() => {
    if (screenRequiresProject(view) && !project) {
      navigateToView("overview");
    }
  }, [view, project]);

  const performCloseSession = async (id: string): Promise<void> => {
    const closingSession = sessionsState.byId[id];
    if (!closingSession) {
      return;
    }
    // Rust invalidates the epoch and tears down its watcher before the same
    // canonical path can be opened as a new incarnation.
    try {
      await invoke("close_project_session", {
        path: id,
        sessionEpoch: closingSession.epoch,
      });
    } catch (error) {
      // Do not pretend the incarnation closed if Rust could not invalidate
      // it; keeping the session visible preserves a single source of truth.
      showErrorDialog(
        t.overviewCloseProject,
        localizeAppError(error, t, t.errorGitCommandFailed),
      );
      return;
    }
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
    // Generation counters deliberately survive and are advanced here: a
    // response started by the closed session must never be accepted by a
    // later session that reopens the same canonical path. Dropping the request
    // entry lets that reopened session start a fresh read; the old request's
    // conditional cleanup cannot erase the replacement.
    releaseDiffCache(diffCacheRef.current, id);
    delete pendingWatchRefreshesRef.current[id];
    delete watchedSessionsRef.current[id];
    for (const key of Object.keys(watcherSequencesRef.current)) {
      if (key.startsWith(`${id}\0`)) {
        delete watcherSequencesRef.current[key];
      }
    }
    versionLinesGenerationsRef.current[id] =
      (versionLinesGenerationsRef.current[id] ?? 0) + 1;
    delete versionLinesRequestsRef.current[id];
    dispatchSessions({ type: "close", id });
    if (sessionsState.activeId === id) {
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
      void performCloseSession(id);
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
    // "Go to X" comes from the screen registry, in nav order, so a new screen
    // reaches the palette by being registered rather than by being remembered
    // here. Actions *within* a screen are not destinations and stay explicit.
    ...NAV_DESTINATIONS.flatMap((destination) => {
      const { screen } = destination;
      if (destination.commandLabelKey === null) {
        return [];
      }
      if (destination.requiresProject && !project) {
        return [];
      }
      if (destination.overlay === "settings") {
        return [{
          id: `open-${destination.id}`,
          label: t[destination.commandLabelKey],
          action: () => setIsSettingsOpen(true),
        }];
      }
      if (screen === null) {
        return [];
      }
      const entries: Command[] = [
        {
          id: `go-${destination.id}`,
          label: t[destination.commandLabelKey],
          action: () => navigateToView(screen),
        },
      ];
      if (screen === "version-lines") {
        entries.push({
          id: "new-version-line",
          label: t.commandNewVersionLine,
          action: () => {
            navigateToView("version-lines");
            setVersionLinesAutoOpenCreate(true);
          },
        });
      }
      return entries;
    }),
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
          <TitlebarMenu
            onOpenAbout={() => setIsAboutOpen(true)}
            onOpenProject={() => void handleOpenProject()}
            onCloseProject={requestCloseActiveProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            hasProject={project !== null}
            isOpeningProject={isOpening}
            canReloadWindow={!hasUnsettledOperation(sessionsState)}
          />
          <button
            className="titlebar-icon-button"
            type="button"
            ref={paletteTriggerRef}
            aria-label={t.titlebarOpenCommandPalette}
            data-tooltip={t.titlebarJumpToHint}
            onClick={openPalette}
          >
            {SEARCH_ICON}
          </button>
          <div className="titlebar-history-controls">
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoBack}
              data-tooltip={t.titlebarGoBack}
              aria-label={t.titlebarGoBack}
              onClick={goBack}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoForward}
              data-tooltip={t.titlebarGoForward}
              aria-label={t.titlebarGoForward}
              onClick={goForward}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <button
            className="titlebar-icon-button"
            type="button"
            aria-label={effectiveTheme === "dark" ? t.titlebarSwitchToLightTheme : t.titlebarSwitchToDarkTheme}
            data-tooltip={effectiveTheme === "dark" ? t.titlebarSwitchToLightTheme : t.titlebarSwitchToDarkTheme}
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

        <span className="titlebar-badge" aria-label={t.alphaBadgeAriaLabel}>{t.alphaBadge}</span>

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
              {NAV_DESTINATIONS.filter((destination) => destination.section === "project").map((destination) => {
                const { screen } = destination;
                const isDisabled = screen === null || (destination.requiresProject && !project);
                const disabledLabel =
                  isDisabled && destination.disabledLabelKey ? t[destination.disabledLabelKey] : undefined;
                const isActive = screen !== null && view === screen;
                return (
                  <button
                    key={destination.id}
                    className={`nav-item${isActive ? " nav-item--active" : ""}`}
                    type="button"
                    disabled={isDisabled}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={disabledLabel}
                    data-tooltip={disabledLabel}
                    onClick={screen ? () => navigateToView(screen) : undefined}
                  >
                    <span className="nav-item__icon" aria-hidden="true">{destination.icon}</span>
                    <span className="nav-item__label">{t[destination.labelKey]}</span>
                  </button>
                );
              })}
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
              {NAV_DESTINATIONS.filter((destination) => destination.section === "application").map((destination) => {
                const { screen, overlay } = destination;
                const isActive = overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                const label = t[destination.labelKey];
                return (
                  <button
                    key={destination.id}
                    className={`nav-item${isActive ? " nav-item--active" : ""}`}
                    type="button"
                    disabled={screen === null && overlay === undefined}
                    aria-current={screen !== null && isActive ? "page" : undefined}
                    aria-haspopup={overlay ? "dialog" : undefined}
                    aria-expanded={overlay ? isSettingsOpen : undefined}
                    // The visible label folds away with the collapsed rail;
                    // the accessible name and tooltip keep its icon clear.
                    aria-label={label}
                    data-tooltip={label}
                    onClick={overlay === "settings" ? () => setIsSettingsOpen(true) : screen ? () => navigateToView(screen) : undefined}
                  >
                    <span className="nav-item__icon" aria-hidden="true">{destination.icon}</span>
                    <span className="nav-item__label">{label}</span>
                  </button>
                );
              })}
            </nav>
            <button
              className="sidebar-toggle"
              type="button"
              data-tooltip={isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse}
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
                data-tooltip={t.titlebarGoBack}
                aria-label={t.titlebarGoBack}
                onClick={goBack}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                className="titlebar-icon-button"
                type="button"
                disabled={!canGoForward}
                data-tooltip={t.titlebarGoForward}
                aria-label={t.titlebarGoForward}
                onClick={goForward}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <nav className="compact-nav" aria-label={t.navApplicationAriaLabel}>
              {/* Narrow windows drop a destination entirely rather than
                  showing it disabled: the row is already tight, and the
                  expanded nav is where the "open a project first" explanation
                  belongs. */}
              {NAV_DESTINATIONS.flatMap((destination) => {
                const { screen, overlay } = destination;
                if (
                  !destination.inCompactNav ||
                  (screen === null && overlay === undefined) ||
                  (destination.requiresProject && !project)
                ) {
                  return [];
                }
                const isActive = overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                return (
                  <button
                    key={destination.id}
                    className={`compact-nav__item${isActive ? " compact-nav__item--active" : ""}`}
                    type="button"
                    aria-current={screen !== null && isActive ? "page" : undefined}
                    aria-haspopup={overlay ? "dialog" : undefined}
                    aria-expanded={overlay ? isSettingsOpen : undefined}
                    onClick={overlay === "settings" ? () => setIsSettingsOpen(true) : () => screen && navigateToView(screen)}
                  >
                    <span aria-hidden="true">{destination.icon}</span>
                    {t[destination.labelKey]}
                  </button>
                );
              })}
            </nav>
          </div>
          {view === "overview" && !project && (
            <header className="topbar">
              <h1>{t.navOverview}</h1>
            </header>
          )}

          {view === "overview" && skippedRestoreCount > 0 && (
            <p className="restore-skipped-notice" role="status">
              <span>{t.startupRestoreSkippedNotice(skippedRestoreCount)}</span>
              <button
                type="button"
                aria-label={t.commonClose}
                onClick={() => setSkippedRestoreCount(0)}
              >
                <X aria-hidden="true" />
              </button>
            </p>
          )}

          {/* One mounted set of screens per project session: keying the
              host by the active session drops the previous project's
              screens instead of keeping them alive against a project the
              user has left. */}
          <KeepAliveScreens
            key={sessionsState.activeId ?? "no-project"}
            active={view}
            screens={{
              overview: (
                <OverviewPanel
                  project={project}
                  isOpening={isOpening}
                  workingTree={workingTree}
                  workingTreeError={workingTreeError}
                  isCheckingChanges={isCheckingChanges}
                  onCheckChanges={() => projectPath && void checkWorkingTree(projectPath)}
                  onReviewChanges={(path) => {
                    if (path && sessionsState.activeId) {
                      dispatchSessions({
                        type: "setChangesSelection",
                        id: sessionsState.activeId,
                        selection: {
                          selectedPath: path,
                          excludedPaths: activeSession?.changesSelection.excludedPaths ?? [],
                        },
                      });
                    }
                    navigateToView("changes");
                  }}
                  onOpenProject={() => void handleOpenProject()}
                  canPublish={canPublish}
                  onPublish={() => openPublishDialog()}
                  onPublishUpTo={(commit) => openPublishDialog(commit)}
                  pendingVersions={pendingVersions}
                  pendingVersionsError={pendingVersionsError}
                  onRetryPendingVersions={() => projectPath && void checkWorkingTree(projectPath)}
                  versionLines={activeSession?.versionLines ?? null}
                  isLoadingVersionLines={activeSession?.isLoadingVersionLines ?? false}
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
                  onCopyPathError={() =>
                    showErrorDialog(t.overviewCopyPathFailedTitle, t.overviewCopyPathFailedMessage)
                  }
                  onOpenSaveVersion={() => {
                    startSessionOperation("save");
                    navigateToView("changes");
                  }}
                />
              ),
              // Project-only screens are absent, not disabled, when no
              // project is open: the host drops what it is not given.
              ...(project
                ? {
                    changes: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <ChangesPanel
                          projectPath={project.path}
                          workingTree={workingTree}
                          workingTreeError={workingTreeError}
                          isCheckingChanges={isCheckingChanges}
                          workingTreeCheckedAt={workingTreeCheckedAt}
                          diffCache={diffCacheRef.current}
                          sessionEpoch={activeSession?.epoch}
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
                    ),
                    "version-lines": (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <VersionLinesPanel
                          projectPath={project.path}
                          snapshot={activeSession?.versionLines ?? null}
                          error={activeSession?.versionLinesError ?? null}
                          isLoading={activeSession?.isLoadingVersionLines ?? false}
                          onRefresh={() => void refreshVersionLines(project.path)}
                          onSnapshot={(snapshot) => commitVersionLines(project.path, snapshot)}
                          onChanged={() => void handleVersionLineChanged(project.path)}
                          onOperationStart={() => startVersionLineOperation(project.path)}
                          onOperationFinish={() => finishSessionOperation(project.path)}
                          onOperationPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
                          onSaveVersion={() => {
                            startSessionOperation("save");
                            navigateToView("changes");
                          }}
                          onOpenChanges={() => navigateToView("changes")}
                          autoOpenCreate={versionLinesAutoOpenCreate}
                          onAutoOpenCreateHandled={() => setVersionLinesAutoOpenCreate(false)}
                        />
                      </Suspense>
                    ),
                  }
                : {}),
            }}
          />
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
              void handleVersionLineChanged(project.path);
              finishSessionOperation(project.path);
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

      {isSettingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}>
          <div
            ref={settingsDialogRef}
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            aria-describedby="settings-dialog-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-dialog__header">
              <div>
                <h2 id="settings-dialog-title">{t.navSettings}</h2>
                <p id="settings-dialog-description">{t.settingsDialogDescription}</p>
              </div>
              <button
                className="settings-dialog__close"
                type="button"
                aria-label={t.commonClose}
                onClick={() => setIsSettingsOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <SettingsPanel
              theme={theme}
              setTheme={setTheme}
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
          </div>
        </div>
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

      {isShortcutsOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsShortcutsOpen(false)}>
          <div
            ref={shortcutsDialogRef}
            className="about-dialog shortcuts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="about-dialog__close"
              type="button"
              aria-label={t.commonClose}
              onClick={() => setIsShortcutsOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="shortcuts-title">{t.shortcutsDialogTitle}</h2>
            <ul className="shortcuts-list">
              <li>
                <span>{t.shortcutsOpenPalette}</span>
                <span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>K</kbd></span>
              </li>
              <li>
                <span>{t.shortcutsNextProject}</span>
                <span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Tab</kbd></span>
              </li>
              <li>
                <span>{t.shortcutsPreviousProject}</span>
                <span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Shift</kbd><kbd>Tab</kbd></span>
              </li>
              <li>
                <span>{t.shortcutsCloseDialogs}</span>
                <span className="shortcuts-list__keys"><kbd>Esc</kbd></span>
              </li>
            </ul>
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
                onClick={() => closeTargetId && void performCloseSession(closeTargetId)}
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
      <TooltipHost />
    </div>
  );
}

document.addEventListener("contextmenu", (event) => event.preventDefault());

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SwitchMeasurementRoot>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </SwitchMeasurementRoot>
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
