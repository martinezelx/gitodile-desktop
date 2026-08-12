import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Copy,
  Square,
  X,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  TriangleAlert,
  FolderX,
  RotateCw,
  Info,
  Settings,
  Bug,
  Keyboard,
} from "lucide-react";
import { useLanguage } from "./i18n";
import { localizeAppError } from "./shared/i18n";
import type { RepositoryInvalidation } from "./repositoryInvalidation";
import { autoHideScrollbarProps } from "./shared/ui/autoHideScrollbar";
import { createChangesController, changesPort } from "./features/changes";
import { createRepositoryController, createRepositoryReadCoordinator, repositoryPort } from "./features/repository";
import { createStatusController, statusPort, type StatusErrorMapper } from "./features/status";
import { settingsPort, useGitTooling, type ThemePreference } from "./features/settings";
import {
  createVersionLinesController,
  useVersionLinesState,
  versionLinesPort,
} from "./features/version-lines";
import { useModalFocus } from "./shared/ui/modalFocus";
import { TooltipHost } from "./tooltip";
import { LoadingBar } from "./shared/ui/loadingBar";
import {
  EMPTY_CHANGES_SELECTION,
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  hasUnsettledOperation,
  initialProjectSessionsState,
  projectSessionsStateToStored,
  readStoredProjects,
  writeStoredProjects,
  type ProjectView,
} from "./projectSessions";
import { createProjectRuntime, scheduleIdleTask, useProjectSelector } from "./projectRuntime";
import { useProjectCacheWarming } from "./features/repository";
import {
  ProjectSwitcher,
  ProjectSwitcherCompact,
  ProjectSwitcherIcons,
  type ProjectSwitcherEntry,
} from "./projectSwitcher";
import {
  ChangesPanel,
  KeepAliveScreens,
  OverviewPanel,
  NAV_DESTINATIONS,
  VersionLinesScreen,
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
const PublishDialog = lazy(() => import("./features/publish/PublishDialog").then((m) => ({ default: m.PublishDialog })));
const PendingVersionsSection = lazy(() =>
  import("./features/overview/PendingVersionsSection").then((m) => ({ default: m.PendingVersionsSection })),
);
const CreateVersionLineDialog = lazy(() =>
  import("./features/version-lines/VersionLinesDialog").then((m) => ({ default: m.CreateVersionLineDialog })),
);
const SwitchVersionLineDialog = lazy(() =>
  import("./features/version-lines/VersionLinesDialog").then((m) => ({ default: m.SwitchVersionLineDialog })),
);
const SettingsPanel = lazy(() =>
  import("./features/settings/SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
);

/** Kept as a local alias so the many `View` references below stay readable;
 * `screens.tsx` owns the definition and the registry that lists them. */
type View = ScreenId;

const THEME_STORAGE_KEY = "gitodrile-theme";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";
const APP_VERSION = "0.1.0";
const ISSUES_URL = "https://github.com/martinezelx/project-gitodrile/issues/new";
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent);
const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";

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
  const [projectRuntime] = useState(() => createProjectRuntime(initialProjectSessionsState));
  const [versionLinesController] = useState(() => createVersionLinesController(versionLinesPort));
  const [repositoryController] = useState(() => createRepositoryController(repositoryPort));
  const [statusController] = useState(() => createStatusController(statusPort));
  const [changesController] = useState(() => createChangesController(changesPort));
  // The error mapper is rebuilt whenever the language changes, so subscribers
  // read it through a ref rather than closing over the first render's copy.
  const mapStatusErrorRef = useRef<StatusErrorMapper>(() => "");
  const [repositoryReads] = useState(() =>
    createRepositoryReadCoordinator(repositoryController, [
      {
        id: "status",
        refreshOn: "worktree-change",
        blocking: true,
        refresh: (query) => statusController.refresh(projectRuntime, query, mapStatusErrorRef.current),
        supersede: (query) => statusController.supersede(query),
      },
      {
        id: "version-lines",
        refreshOn: "shared-change",
        blocking: false,
        refresh: (query) => versionLinesController.refresh(query),
        supersede: (query) => versionLinesController.supersede(query),
      },
    ]),
  );
  const sessionsState = useProjectSelector(projectRuntime, (snapshot) => snapshot);
  const dispatchSessions = projectRuntime.dispatch;
  // Tracks only native watcher registrations. Read generations, mutation
  // deferral and diff retention belong to the feature controllers above.
  const watchedSessionsRef = useRef<Record<string, string>>({});
  const activeSession = sessionsState.activeId ? sessionsState.byId[sessionsState.activeId] : null;
  const activeVersionLinesQuery = useMemo(
    () => ({ projectId: activeSession?.id ?? "", sessionEpoch: activeSession?.epoch ?? "" }),
    [activeSession?.epoch, activeSession?.id],
  );
  const activeVersionLines = useVersionLinesState(versionLinesController, activeVersionLinesQuery);
  const project = activeSession?.project ?? null;
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const workingTreeCheckedAt = activeSession?.workingTreeCheckedAt ?? null;
  const pendingVersions = activeSession?.pendingVersions ?? EMPTY_PENDING_VERSIONS;
  const pendingVersionsError = activeSession?.pendingVersionsError ?? null;
  const mapStatusError = useMemo<StatusErrorMapper>(
    () => (error, area) =>
      localizeAppError(
        error,
        t,
        area === "working-tree" ? t.statusCouldntCheck : t.overviewPendingVersionsError,
      ),
    [t],
  );
  mapStatusErrorRef.current = mapStatusError;
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
  // Version-lines feature screen's own dialog state because Overview isn't
  // that screen's React subtree. Both use the feature-owned dialogs and port.
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
  const gitTooling = useGitTooling(settingsPort);
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

  const checkWorkingTree = async (path: string, requestedEpoch?: string): Promise<void> => {
    const epoch = requestedEpoch ?? sessionsState.byId[path]?.epoch;
    if (epoch) await statusController.refresh(projectRuntime, { projectId: path, sessionEpoch: epoch }, mapStatusError);
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
  // "selected". The mutation result is committed directly to the
  // Version-lines feature controller by both the screen and Overview dialogs,
  // so this callback only refreshes repository facts shared by features.
  const handleVersionLineChanged = async (path: string): Promise<void> => {
    repositoryReads.discardDeferred(path);
    dispatchSessions({ type: "setChangesSelection", id: path, selection: EMPTY_CHANGES_SELECTION });
    await repositoryReads.refreshAll(projectRuntime, sessionsState, path);
  };

  const handleMutationSucceeded = (path: string): Promise<void> =>
    repositoryReads.refreshAfterMutation(projectRuntime, sessionsState, path);

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
    repositoryReads.finishDeferred(projectRuntime, sessionsState, path);
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
      const info = await repositoryController.open({ selectedPath: selected });
      // Opening an already-open worktree activates it instead of duplicating
      // it — `existing` is read before dispatching so its (possibly stale)
      // `lastView` is available for `syncViewToSession` below.
      const existing = sessionsState.byId[info.path];
      dispatchSessions({ type: "open", project: info });
      syncViewToSession(existing?.lastView ?? "overview");
      setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
      if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
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
          const info = await repositoryController.open({ selectedPath: path });
          dispatchSessions({ type: "open", project: info });
          void checkWorkingTree(info.path, info.sessionEpoch);
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
    repositoryReads.handleInvalidation(projectRuntime, sessionsState, event);
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
  useProjectCacheWarming({
    runtime: projectRuntime,
    hasCompletedSessionRestore,
    projectPath,
    session: activeSession,
    changesController,
    versionLinesController,
  });

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
    // Explicitly evict feature-owned state for this session incarnation.
    // Their generations reject late responses from the closed epoch.
    changesController.close(id, closingSession.epoch);
    statusController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    repositoryReads.close(id, closingSession.epoch);
    delete watchedSessionsRef.current[id];
    versionLinesController.close({ projectId: id, sessionEpoch: closingSession.epoch });
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
            key={activeSession?.epoch ?? "no-project"}
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
                  versionLines={activeVersionLines.snapshot}
                  isLoadingVersionLines={activeVersionLines.isLoading}
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
                          controller={changesController}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          onRefresh={() => projectPath && void checkWorkingTree(projectPath)}
                          onSaveCompleted={() => void handleMutationSucceeded(project.path)}
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
                        <VersionLinesScreen
                          controller={versionLinesController}
                          projectPath={project.path}
                          sessionEpoch={activeSession?.epoch ?? ""}
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
            sessionEpoch={publishDialogSession.epoch}
            upTo={publishUpTo ?? undefined}
            onClose={() => {
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
            }}
            onPublished={(result) => {
              statusController.commitPublishedResult(
                projectRuntime,
                {
                  projectId: publishDialogSession.project.path,
                  sessionEpoch: publishDialogSession.epoch,
                },
                result.remainingAfterPublish,
              );
              return handleMutationSucceeded(publishDialogSession.project.path);
            }}
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
            sessionEpoch={activeSession?.epoch ?? ""}
            target={overviewSwitchTarget}
            onClose={() => {
              setOverviewSwitchTarget(null);
              finishSessionOperation(project.path);
            }}
            onSwitched={(snapshot) => {
              versionLinesController.commit(activeVersionLinesQuery, snapshot);
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
            sessionEpoch={activeSession?.epoch ?? ""}
            forceSwitch={overviewCreateRequest.forceSwitch}
            onClose={() => {
              setOverviewCreateRequest(null);
              finishSessionOperation(project.path);
            }}
            onCreated={(snapshot) => {
              versionLinesController.commit(activeVersionLinesQuery, snapshot);
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
            <Suspense fallback={<ViewLoadingFallback />}>
              <SettingsPanel
                theme={theme}
                setTheme={setTheme}
                gitDiagnostics={gitTooling.diagnostics}
                gitUpdateStatus={gitTooling.updateStatus}
                onCheckGitUpdate={gitTooling.checkUpdate}
                isCheckingGitUpdate={gitTooling.isCheckingUpdate}
                onRefreshGitDiagnostics={gitTooling.refreshDiagnostics}
                isRefreshingGitDiagnostics={gitTooling.isRefreshingDiagnostics}
                reopenLastProject={reopenLastProject}
                setReopenLastProject={setReopenLastProject}
                confirmCloseProject={confirmCloseProject}
                setConfirmCloseProject={setConfirmCloseProject}
              />
            </Suspense>
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
