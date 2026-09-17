import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Copy,
  FolderInput,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Square,
  UserRound,
  X,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  TriangleAlert,
} from "lucide-react";
import { useLanguage } from "../i18n";
import { isAppError, localizeAppError } from "../shared/i18n";
import type { RepositoryInvalidation } from "../runtime/project/invalidation";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";
import { handlePopupMenuKeyDown, usePortalFlyout } from "../shared/ui";
import { DiffPreferencesProvider, createChangesController, changesPort } from "../features/changes";
import { CloneDialog, clonePort, createCloneController, type CloneResult } from "../features/clone";
import {
  createInitializeProjectController,
  InitializeProjectDialog,
  initializeProjectPort,
  type InitializeProjectResult,
  type InitializeTargetKind,
} from "../features/initialize-project";
import {
  NotificationCenter,
  useNotificationCenter,
  type AppNotification,
} from "../features/notifications";
import { createSaveVersionController, SaveVersionDialog, saveVersionPort } from "../features/save-version";
import {
  createRepositoryController,
  createRepositoryReadCoordinator,
  repositoryPort,
  type RepositoryInfo,
} from "../features/repository";
import { createStatusController, statusPort, type StatusErrorMapper } from "../features/status";
import {
  createSyncController,
  EMPTY_TEAM_SYNC_STATE,
  GetTeamChangesDialog,
  selectTeamSyncState,
  syncPort,
  useAutomaticRemoteCheck,
  type SyncErrorMapper,
} from "../features/sync";
import {
  SETTINGS_SECTIONS,
  settingsPort,
  settingsSectionLabel,
  DEFAULT_BRANCH_FALLBACK,
  readGitVersion,
  useDefaultBranch,
  useGitIdentity,
  useGitTooling,
  useLineEndings,
  type NavigationPreferences,
  type SettingsSection,
  type ThemePreference,
} from "../features/settings";
import {
  createProjectSettingsCache,
  projectSettingsPort,
  warmProjectSettings,
  type ProjectSettingsSection,
} from "../features/project-settings";
import {
  createVersionLinesController,
  useStoredFavouriteVersionLines,
  useVersionLinesState,
  versionLinesPort,
} from "../features/version-lines";
import { createHistoryController, historyPort } from "../features/history";
import { appUpdatesPort, createAppUpdatesController, useAppUpdatesController, type UpdateState } from "../features/app-updates";
import { TooltipHost } from "../shared/ui/tooltip";
import { LoadingBar } from "../shared/ui/loadingBar";
import { AppOverlays } from "./AppOverlays";
import { useIssueReport } from "./useIssueReport";
import { CROCODILE_MARK } from "./branding";
import { CommandPalette, type AppCommand } from "./CommandPalette";
import {
  CONFIRM_CLOSE_PROJECT_DEFAULT,
  CONFIRM_CLOSE_PROJECT_STORAGE_KEY,
  CONFIRM_DISCARD_DEFAULT,
  CONFIRM_DISCARD_STORAGE_KEY,
  NOTIFICATIONS_DEFAULT,
  NOTIFICATIONS_STORAGE_KEY,
  REOPEN_LAST_PROJECT_DEFAULT,
  REOPEN_LAST_PROJECT_STORAGE_KEY,
  RUN_GIT_HOOKS_DEFAULT,
  RUN_GIT_HOOKS_STORAGE_KEY,
  SIDEBAR_HIDDEN_DEFAULT,
  SIDEBAR_HIDDEN_STORAGE_KEY,
  WATCH_PROJECTS_DEFAULT,
  WATCH_PROJECTS_STORAGE_KEY,
  APP_UPDATE_AUTOMATIC_DEFAULT,
  APP_UPDATE_AUTOMATIC_STORAGE_KEY,
  applyTheme,
  resolveEffectiveTheme,
  useStoredBoolean,
  useStoredFavouriteProjects,
  useStoredDiffPreferences,
  useStoredNavigationPreferences,
  useStoredRemoteCheckInterval,
  useReducedMotionPreference,
  useThemePreference,
} from "./preferences";
import { startThemeFade } from "./themeTransition";
import { planWatcherChanges } from "./watcherPlan";
import { TitlebarMenu } from "./TitlebarMenu";
import { RailNav, type RailNavItem } from "./RailNav";
import { StatusBar } from "./StatusBar";
import {
  EMPTY_CHANGES_SELECTION,
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  hasUnsettledOperation,
  initialProjectSessionsState,
  projectSessionsStateToStored,
  readStoredProjects,
  writeStoredProjects,
  type ProjectMutationPhase,
  type ProjectView,
} from "../runtime/project/sessions";
import {
  forgetRecentProject,
  readRecentProjects,
  rememberRecentProject,
  type RecentProject,
} from "../runtime/project/recentProjects";
import { createProjectRuntime, scheduleIdleTask, useProjectSelector } from "../runtime/project/runtime";
import { useProjectCacheWarming } from "../features/repository";
import {
  ProjectSwitcherCompact,
  ProjectSwitcherRail,
  type ProjectSwitcherEntry,
  orderByFavourite,
} from "./project-switcher/ProjectSwitcher";
import { avatarColorVar, avatarInitials } from "../shared/ui/projectAvatar";
import {
  ChangesPanel,
  HistoryScreen,
  KeepAliveScreens,
  OverviewPanel,
  NAV_DESTINATIONS,
  VersionLinesScreen,
  markScreenSwitchIntent,
  prefetchScreenChunks,
  screenRequiresProject,
  type ScreenId,
} from "./screens";
import "../styles.css";

// Lazily loaded: none of these are needed for the first paint (the Overview
// screen with no project open), and ChangesPanel/PublishDialog/PendingVersions
// pull in the file-type icon set (~70 SVGs). Deferring them keeps the initial
// bundle — and therefore first-paint time — small. The two screen panels live
// in `screens.tsx` next to their registry entries; these are the dialogs,
// which are not screens.
const PublishDialog = lazy(() => import("../features/publish/PublishDialog").then((m) => ({ default: m.PublishDialog })));
const CreateVersionLineDialog = lazy(() =>
  import("../features/version-lines/VersionLinesDialog").then((m) => ({ default: m.CreateVersionLineDialog })),
);
const SwitchVersionLineDialog = lazy(() =>
  import("../features/version-lines/VersionLinesDialog").then((m) => ({ default: m.SwitchVersionLineDialog })),
);
/** Kept as a local alias so the many `View` references below stay readable;
 * `screens.tsx` owns the definition and the registry that lists them. */
type View = ScreenId;

const PROJECT_NAV_DESTINATIONS = NAV_DESTINATIONS.filter(
  (destination) => destination.section === "project",
);
const DEFAULT_NAVIGATION_PREFERENCES = {
  visibleDestinationIds: PROJECT_NAV_DESTINATIONS.map((destination) => destination.id),
  destinationOrderIds: PROJECT_NAV_DESTINATIONS.map((destination) => destination.id),
  displayMode: "icons-and-text",
} satisfies NavigationPreferences;

type WatcherRegistrationState = "starting" | "watching" | "unavailable";
type WatcherRegistration = { epoch: string; state: WatcherRegistrationState };

/** Suspense fallback for a lazily-loaded view (see `ChangesPanel` below).
 * Only ever visible on the first navigation into that view before its chunk
 * has been fetched — normally masked entirely by the idle-time prefetch in
 * `App.tsx`. */
function ViewLoadingFallback(): React.JSX.Element {
  const { t } = useLanguage();
  return <LoadingBar label={t.commonLoading} />;
}

export function App(): React.JSX.Element {
  const { t } = useLanguage();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isAppUpdateOpen, setIsAppUpdateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /* Declared beside the Settings flag because `hasBlockingDialog` below reads
     both, and a `const` cannot be read before it exists. */
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [projectSettingsSection, setProjectSettingsSection] =
    useState<ProjectSettingsSection>("remote");
  /* Owned here because the dialog is unmounted on every close: without it each
     opening pays again for the same Git processes. Keyed by project and session
     epoch, so a reopened project never sees the previous session's answers. */
  const projectSettingsCache = useRef(createProjectSettingsCache()).current;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [watcherRegistrations, setWatcherRegistrations] = useState<Record<string, WatcherRegistration>>({});
  const [repositoryListenerState, setRepositoryListenerState] = useState<"starting" | "listening" | "unavailable">(
    () => "__TAURI_INTERNALS__" in window ? "starting" : "unavailable",
  );
  const [initializeDialogRequest, setInitializeDialogRequest] = useState<{
    mode: InitializeTargetKind;
    existingPath?: string;
  } | null>(null);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useThemePreference();
  const effectiveTheme = resolveEffectiveTheme(theme);
  // `applyTheme` runs alongside `setTheme` because the hook applies the
  // attribute from a passive effect, which is not guaranteed to have run by the
  // time a transition captures the DOM.
  const commitTheme = (next: ThemePreference) => (): void => {
    applyTheme(next);
    setTheme(next);
  };
  // Which animation a theme change gets is a composition decision, not one the
  // Settings feature or the palette should carry: they report the preference
  // the user picked and nothing else.
  const changeTheme = (next: ThemePreference): void => {
    // Re-picking the active option is a no-op, and snapshotting the window to
    // cross-fade it into an identical frame is a no-op with a cost.
    if (next === theme) return;
    startThemeFade(commitTheme(next));
  };
  const toggleTheme = (): void => {
    startThemeFade(commitTheme(effectiveTheme === "dark" ? "light" : "dark"));
  };
  const [projectRuntime] = useState(() => createProjectRuntime(initialProjectSessionsState));
  const [versionLinesController] = useState(() => createVersionLinesController(versionLinesPort));
  const [historyController] = useState(() => createHistoryController(historyPort));
  const [repositoryController] = useState(() => createRepositoryController(repositoryPort));
  const [cloneController] = useState(() => createCloneController(clonePort));
  const [initializeProjectController] = useState(() =>
    createInitializeProjectController(initializeProjectPort),
  );
  const [initialSaveVersionController] = useState(() =>
    createSaveVersionController(saveVersionPort),
  );
  const [statusController] = useState(() => createStatusController(statusPort));
  const [changesController] = useState(() => createChangesController(changesPort));
  const [syncController] = useState(() => createSyncController(syncPort));
  // The error mapper is rebuilt whenever the language changes, so subscribers
  // read it through a ref rather than closing over the first render's copy.
  const mapStatusErrorRef = useRef<StatusErrorMapper>(() => "");
  const mapSyncErrorRef = useRef<SyncErrorMapper>(() => "");
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
      {
        id: "history",
        refreshOn: "shared-change",
        blocking: false,
        refresh: (query) => historyController.refresh(query),
        supersede: (query) => historyController.supersede(query),
      },
      {
        id: "sync",
        refreshOn: "shared-change",
        blocking: false,
        refresh: async (query) => {
          await syncController.refreshLocal(projectRuntime, query, mapSyncErrorRef.current);
        },
        supersede: (query) => syncController.supersede(projectRuntime, query),
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
  const [favouriteVersionLines, toggleFavouriteVersionLine] =
    useStoredFavouriteVersionLines(project?.commonGitDir ?? null);
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const pendingVersions = activeSession?.pendingVersions ?? EMPTY_PENDING_VERSIONS;
  const pendingVersionsError = activeSession?.pendingVersionsError ?? null;
  const teamSync = activeSession?.teamSync ?? EMPTY_TEAM_SYNC_STATE;
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
  const mapSyncError = useMemo<SyncErrorMapper>(
    () => (error) => localizeAppError(error, t, t.syncUnavailableTitle),
    [t],
  );
  mapSyncErrorRef.current = mapSyncError;
  const [projectAnnouncement, setProjectAnnouncement] = useState("");
  const [storedProjectsOnLaunch] = useState(readStoredProjects);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>(readRecentProjects);
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
  // separately so closing the overlay can clear stale content independently.
  const [openError, setOpenError] = useState<string | null>(null);
  const [openErrorTitle, setOpenErrorTitle] = useState(t.overviewOpenFailedTitle);
  const [isOpenErrorDialogOpen, setIsOpenErrorDialogOpen] = useState(false);
  const [openErrorRecoveryAction, setOpenErrorRecoveryAction] = useState<{
    label: string;
    onAction: () => void;
  } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  /** True only while a drag is actually over the window, so the drop overlay
   * is feedback about a gesture in progress and never app chrome. */
  const [isFolderDropTarget, setIsFolderDropTarget] = useState(false);
  const [publishDialogSessionId, setPublishDialogSessionId] = useState<string | null>(null);
  const [publishUpTo, setPublishUpTo] = useState<string | null>(null);
  const [saveDialogSessionId, setSaveDialogSessionId] = useState<string | null>(null);
  const [getTeamDialogSessionId, setGetTeamDialogSessionId] = useState<string | null>(null);
  // App-wide bounded quick-switch and Overview's quick-create are distinct
  // from the Lines screen's own dialog state because neither entry point is
  // inside that screen's React subtree. All use the feature-owned dialogs and
  // port, so the safety plan stays identical whichever shortcut was used.
  const [versionLineSwitchTarget, setVersionLineSwitchTarget] = useState<string | null>(null);
  const [createLineRequest, setCreateLineRequest] = useState<
    { forceSwitch: boolean; startVersion?: { commit: string; shortCommit: string; subject: string } | null } | null
  >(null);
  const [versionLinesAutoOpenCreate, setVersionLinesAutoOpenCreate] = useState(false);
  /* Where one screen asked another to look. Both are consumed once and cleared
     by the screen that takes them: `KeepAliveScreens` holds every visited
     screen mounted for the session, so a target left standing would re-apply on
     the next render here and quietly undo whatever the reader chose after
     arriving. Neither is persisted — where someone was heading is not durable
     project state. */
  const [historyScopeLineIntent, setHistoryScopeLineIntent] = useState<string | null>(null);
  /** A saved version Lines asked History to open, alongside the line it is on. */
  const [historySelectCommitIntent, setHistorySelectCommitIntent] = useState<string | null>(null);
  const [linesSelectIntent, setLinesSelectIntent] = useState<string | null>(null);
  const publishDialogSession = publishDialogSessionId
    ? sessionsState.byId[publishDialogSessionId] ?? null
    : null;
  const getTeamDialogSession = getTeamDialogSessionId
    ? sessionsState.byId[getTeamDialogSessionId] ?? null
    : null;
  // Blocking rather than retargeting an open confirmation/operation is
  // simpler and safer than reconciling it against a different project mid-
  // flight (see the "Decisions" section of task 012): switching and closing
  // the active project are both disabled while either dialog is open.
  const hasBlockingDialog =
    isSettingsOpen ||
    // Scoped to one project: switching underneath it would leave the panel
    // reading and writing a repository the app is no longer showing.
    isProjectSettingsOpen ||
    isCloneOpen ||
    initializeDialogRequest !== null ||
    publishDialogSessionId !== null ||
    saveDialogSessionId !== null ||
    getTeamDialogSessionId !== null ||
    activeSession?.operation?.kind === "version-line" ||
    activeSession?.operation?.kind === "discard";
  const showErrorDialog = (title: string, message: string): void => {
    setOpenErrorTitle(title);
    setOpenError(message);
    setOpenErrorRecoveryAction(null);
    setIsOpenErrorDialogOpen(true);
  };

  /* `sessionId` names the session to operate on when it is not the active one
     yet — the notification centre activates a project and opens its review flow
     in the same gesture, and the activation has not reached this render's
     `activeSession` at that point. Everything below already addresses the
     session by id, so this only replaces where the id comes from. */
  const closeSaveDialog = (): void => {
    if (saveDialogSessionId) {
      finishSessionOperation(saveDialogSessionId);
    }
    setSaveDialogSessionId(null);
  };
  const setSaveDialogPhase = (phase: ProjectMutationPhase): void => {
    if (saveDialogSessionId) {
      dispatchSessions({ type: "setOperationPhase", id: saveDialogSessionId, phase });
    }
  };

  const startSessionOperation = (
    kind: "save" | "publish" | "discard" | "sync",
    upTo?: string,
    sessionId?: string,
  ): boolean => {
    const session = sessionId ? sessionsState.byId[sessionId] : activeSession;
    if (!session) {
      return false;
    }
    const blocker = getMutationBlocker(sessionsState, session.id);
    if (blocker) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherMutationBlocked(blocker.project.name),
      );
      return false;
    }
    dispatchSessions({ type: "startOperation", id: session.id, kind });
    if (kind === "save") {
      setSaveDialogSessionId(session.id);
    } else if (kind === "publish") {
      setPublishUpTo(upTo ?? null);
      setPublishDialogSessionId(session.id);
    } else if (kind === "sync") {
      setGetTeamDialogSessionId(session.id);
    }
    return true;
  };

  /* The notification centre's one action.

     A notification names the project it happened to, and by the time anyone
     opens the panel that project may no longer be the active one — so the
     action activates it and opens the review flow for that same session in one
     gesture, naming the session explicitly rather than waiting for the
     activation to reach a later render.

     An earlier version parked the id in state and let an effect fire once the
     switch landed. That left an intent nothing was guaranteed to clear: when
     `activateSession` declined — it refuses outright while a blocking dialog is
     open — the parked id survived, and the review dialog appeared out of
     nowhere the next time that project happened to become active.

     A project that has since been closed does nothing at all. The notification
     stays in the list as a record of what happened; it was never a promise that
     the project is still open. */
  const reviewTeamChangesFromNotification = (notification: AppNotification): void => {
    const id = notification.projectId;
    if (id === null || !sessionsState.byId[id] || hasBlockingDialog) return;
    if (sessionsState.activeId !== id) activateSession(id);
    startSessionOperation("sync", undefined, id);
  };

  const openPublishDialog = (upTo?: string): void => {
    startSessionOperation("publish", upTo);
  };
  const [skippedRestoreCount, setSkippedRestoreCount] = useState(0);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const gitTooling = useGitTooling(settingsPort);
  const issueReport = useIssueReport(readGitVersion(gitTooling.diagnostics));
  /* Read once after first paint and kept, like the Git diagnostics above.
     Owned here rather than inside the panel because the shell unmounts the
     panel on every close, which used to throw both answers away and pay for
     them again on the next opening. */
  const gitIdentity = useGitIdentity(settingsPort);
  const defaultBranch = useDefaultBranch(settingsPort);
  const lineEndings = useLineEndings(
    settingsPort,
    activeSession?.id ?? null,
    activeSession?.epoch ?? null,
  );
  /* Not persisted: Settings opens on General unless a caller names a section.
     Every route that genuinely wants a different one — the palette's
     per-section entries, the "Git needs attention" header button, the
     create-project identity link — says so by passing it, so remembering the
     last visit only made the plain open unpredictable. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  /** The one way to open Settings. Callers that want a particular section name
   * it; everyone else gets General. */
  const openSettings = (section: SettingsSection = "general"): void => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  };
  /* The per-project panel. Opening it for a project that is not the active one
     activates that project first: everything it reads is scoped to an open
     repository, so the panel and the app must agree on which one that is. */
  const openProjectSettings = (
    id?: string,
    section: ProjectSettingsSection = "remote",
  ): void => {
    if (id && id !== sessionsState.activeId) {
      if (hasBlockingDialog) return;
      activateSession(id);
    }
    setProjectSettingsSection(section);
    setIsProjectSettingsOpen(true);
  };
  /** Starts the read the panel opens with while the pointer is still on its way
   * to the gear. A user who never opens it pays nothing. */
  const prefetchProjectSettings = (id?: string): void => {
    const session = id ? sessionsState.byId[id] : activeSession;
    if (!session) return;
    warmProjectSettings(projectSettingsCache, projectSettingsPort, {
      path: session.project.path,
      sessionEpoch: session.epoch,
    });
  };
  const [diffPreferences, setDiffPreferences] = useStoredDiffPreferences();
  const [reducedMotion, setReducedMotion] = useReducedMotionPreference();
  const [navigationPreferences, setNavigationPreferences] =
    useStoredNavigationPreferences(DEFAULT_NAVIGATION_PREFERENCES.visibleDestinationIds);
  const [reopenLastProject, setReopenLastProject] = useStoredBoolean(
    REOPEN_LAST_PROJECT_STORAGE_KEY,
    REOPEN_LAST_PROJECT_DEFAULT,
  );
  const [confirmCloseProject, setConfirmCloseProject] = useStoredBoolean(
    CONFIRM_CLOSE_PROJECT_STORAGE_KEY,
    CONFIRM_CLOSE_PROJECT_DEFAULT,
  );
  const [watchProjects, setWatchProjects] = useStoredBoolean(
    WATCH_PROJECTS_STORAGE_KEY,
    WATCH_PROJECTS_DEFAULT,
  );
  const [remoteCheckInterval, setRemoteCheckInterval] = useStoredRemoteCheckInterval();
  const [automaticAppUpdates, setAutomaticAppUpdates] = useStoredBoolean(
    APP_UPDATE_AUTOMATIC_STORAGE_KEY,
    APP_UPDATE_AUTOMATIC_DEFAULT,
  );
  /* The controller outlives every render, so it is handed a stable function
     that forwards to whatever the latest render wants done with a background
     result — recording it in the notification centre, which is created a few
     lines below and re-created when notifications are turned on or off. */
  const backgroundUpdateResultRef = useRef<(state: UpdateState) => void>(() => undefined);
  const [appUpdatesController] = useState(() => createAppUpdatesController(appUpdatesPort, {
    automaticEnabled: automaticAppUpdates,
    onBackgroundCheckSettled: (state) => backgroundUpdateResultRef.current(state),
  }));
  const appUpdates = useAppUpdatesController(appUpdatesController, automaticAppUpdates);
  const presentedStartupUpdateRef = useRef(false);
  useEffect(() => {
    if (presentedStartupUpdateRef.current || appUpdates.startupConfirmation.kind === "none") return;
    presentedStartupUpdateRef.current = true;
    setIsAppUpdateOpen(true);
  }, [appUpdates.startupConfirmation]);
  const activeWatcherRegistration = activeSession ? watcherRegistrations[activeSession.id] : undefined;
  const activeWatcherState: "starting" | "watching" | "off" | "unavailable" =
    !watchProjects
      ? "off"
      : repositoryListenerState !== "listening"
        ? repositoryListenerState
        : activeWatcherRegistration && activeWatcherRegistration.epoch === activeSession?.epoch
          ? activeWatcherRegistration.state
          : "starting";
  const [confirmDiscard, setConfirmDiscard] = useStoredBoolean(
    CONFIRM_DISCARD_STORAGE_KEY,
    CONFIRM_DISCARD_DEFAULT,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useStoredBoolean(
    NOTIFICATIONS_STORAGE_KEY,
    NOTIFICATIONS_DEFAULT,
  );
  /* The composition root owns the notification centre because it is the only
     place that sees every outcome worth recording — the automatic remote check
     it drives, and the publish dialog it hosts. The feature itself starts
     nothing: it is a list and a panel. */
  const notificationCenter = useNotificationCenter(notificationsEnabled);
  /* A startup check that finds a release is news the user did not ask for and
     is not looking at, so it goes where such news goes. A check that finds
     nothing, or fails, records nothing: "still up to date" is not an event,
     and a failed update check is already shown in Settings for whoever cares. */
  backgroundUpdateResultRef.current = (state) => {
    if (state.kind !== "available") return;
    notificationCenter.notify({
      projectId: null,
      projectName: null,
      details: { kind: "appUpdateAvailable", version: state.candidate.version },
    });
  };
  /* Travels with every save and publish rather than being read by Rust: it is
     a choice about what this app does with someone's project, not a fact about
     the project, and the command that acts on it is the one that must carry
     it. */
  const [runGitHooks, setRunGitHooks] = useStoredBoolean(
    RUN_GIT_HOOKS_STORAGE_KEY,
    RUN_GIT_HOOKS_DEFAULT,
  );
  // Stored, not per-session: someone who works with the rail collapsed wants
  // it collapsed the next time they open the app, the same as every other
  // chrome preference here.
  const [isSidebarHidden, setIsSidebarHidden] = useStoredBoolean(
    SIDEBAR_HIDDEN_STORAGE_KEY,
    SIDEBAR_HIDDEN_DEFAULT,
  );
  const [favouriteProjectIds, toggleFavouriteProject] = useStoredFavouriteProjects();
  // A short jump menu hanging off the collapse control, for reaching a
  // destination while the rail is away. Hover-opened, so it needs the same
  // grace period any hover menu does: the menu portals to `body` and sits a
  // few pixels below its trigger, and closing on the first `mouseleave` would
  // put the gap between them out of reach.
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const jumpCloseTimer = useRef<number | null>(null);

  const cancelJumpClose = (): void => {
    if (jumpCloseTimer.current !== null) {
      window.clearTimeout(jumpCloseTimer.current);
      jumpCloseTimer.current = null;
    }
  };
  const openJumpMenu = (): void => {
    cancelJumpClose();
    setIsJumpMenuOpen(true);
  };
  const closeJumpMenu = (): void => {
    cancelJumpClose();
    setIsJumpMenuOpen(false);
  };
  const scheduleJumpClose = (): void => {
    cancelJumpClose();
    jumpCloseTimer.current = window.setTimeout(() => {
      jumpCloseTimer.current = null;
      setIsJumpMenuOpen(false);
    }, 260);
  };
  useEffect(() => cancelJumpClose, []);
  /* `"none"`: this is the one flyout in the app that opens on *hover*, and it
     closes itself again when the pointer leaves. Taking the caret as the mouse
     wanders across the collapse button — and then removing the element holding
     it 260ms later — is not something a hover affordance may do. Every other
     flyout opens from a click and does take focus. */
  const { popupRef: jumpMenuRef, style: jumpMenuStyle } = usePortalFlyout(
    isJumpMenuOpen,
    sidebarToggleRef,
    closeJumpMenu,
    "below",
    "none",
  );
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const palettePreviouslyFocusedRef = useRef<HTMLElement | null>(null);

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
      setOpenErrorRecoveryAction(null);
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

  // Recents are recorded from *sessions appearing*, not from each open call
  // site: opening a folder, finishing a clone, initializing a project and
  // restoring last session all end in the same `"open"` dispatch, and a
  // per-caller `rememberRecentProject` would have to be added to each one and
  // then kept there. Reopening a project makes its id appear again, which is
  // what promotes it back to the front of the list.
  const recordedProjectIdsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const opened = sessionsState.order.filter((id) => !recordedProjectIdsRef.current.has(id));
    recordedProjectIdsRef.current = new Set(sessionsState.order);
    if (opened.length === 0) {
      return;
    }
    let entries = recentProjects;
    for (const id of opened) {
      const session = sessionsState.byId[id];
      if (session) entries = rememberRecentProject({ path: id, name: session.project.name });
    }
    setRecentProjects(entries);
    // `recentProjects` is read, never depended on: this effect writes it, and
    // depending on it would re-run the pass it just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsState.order, sessionsState.byId]);

  // Favourites first, then by recency — ordered *before* the welcome screen
  // takes its slice, so a project someone starred stays reachable there after
  // it has aged out of the newest few. The star itself is the app's existing
  // project favourite, not a second list-local mark.
  const recentProjectEntries = orderByFavourite(
    recentProjects.map((entry) => ({ ...entry, isFavourite: favouriteProjectIds.has(entry.path) })),
  );

  const openPalette = (): void => {
    palettePreviouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsPaletteOpen(true);
  };

  const closePalette = (): void => {
    setIsPaletteOpen(false);
    (palettePreviouslyFocusedRef.current ?? paletteTriggerRef.current)?.focus();
  };

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

  /** The one open path. `preselectedPath` skips the folder picker for a folder
   * the user has already named some other way — a row in the welcome screen's
   * recent list, or a folder dropped on the window — so those routes inherit
   * this one's validation, its already-open handling, its announcement, and
   * its "that folder isn't a project yet" recovery instead of copying them. */
  const handleOpenProject = async (preselectedPath?: string): Promise<void> => {
    // `isOpening` guards the one route that can arrive unprompted: a second
    // folder dropped while the first is still opening would run two
    // `open_repository` calls against a single in-flight flag, and the first
    // to finish would clear it under the second. The picker and the recent
    // rows cannot reach this — their controls are disabled meanwhile.
    if (hasBlockingDialog || isOpening) {
      return;
    }
    setOpenError(null);
    let selectedPath: string | null = null;
    try {
      const selected =
        preselectedPath ??
        (await openFolderDialog({ directory: true, multiple: false, title: t.overviewOpenDialogTitle }));
      if (!selected || Array.isArray(selected)) {
        return;
      }
      selectedPath = selected;
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
      setOpenErrorTitle(t.overviewOpenFailedTitle);
      setOpenError(localizeAppError(error, t, t.overviewCouldntOpenFolder));
      setOpenErrorRecoveryAction(
        selectedPath && isAppError(error) && error.code === "not_repository"
          ? {
              label: t.commandTurnFolderIntoProject,
              onAction: () => {
                setIsOpenErrorDialogOpen(false);
                setInitializeDialogRequest({ mode: "existing-folder", existingPath: selectedPath ?? undefined });
              },
            }
          : null,
      );
      setIsOpenErrorDialogOpen(true);
    } finally {
      setIsOpening(false);
    }
  };

  const handleVerifiedClone = async (cloneResult: CloneResult): Promise<void> => {
    const info = await repositoryController.open({ selectedPath: cloneResult.destinationPath });
    const existing = sessionsState.byId[info.path];
    dispatchSessions({ type: "open", project: info });
    syncViewToSession(existing?.lastView ?? "overview");
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
    if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
  };

  const handleInitializedProject = async (
    initializeResult: InitializeProjectResult,
    isCurrent: () => boolean,
  ): Promise<RepositoryInfo | null> => {
    const info = await repositoryController.open({ selectedPath: initializeResult.destinationPath });
    if (!isCurrent()) {
      await invoke("close_project_session", {
        path: info.path,
        sessionEpoch: info.sessionEpoch,
      }).catch(() => undefined);
      return null;
    }
    const existing = sessionsState.byId[info.path];
    dispatchSessions({ type: "open", project: info });
    syncViewToSession(existing?.lastView ?? "overview");
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
    if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
    return info;
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
          setRepositoryListenerState("listening");
        }
      })
      .catch(() => {
        // A listener that can't be registered leaves the app exactly as it
        // was before this feature: manual refreshes only.
        if (!cancelled) setRepositoryListenerState("unavailable");
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /* What History may ask of a version line, and the flow each request is
     handed to. History never mutates a repository itself: switching runs the
     same previewed dialog the status bar and the Lines screen run, creating
     runs the same create dialog, and viewing is navigation. Stable identities,
     because the timeline is memoized and a new object every render would
     re-render every row. */
  const versionLineNames = useMemo(
    () => activeVersionLines.snapshot?.lines.map((line) => line.name) ?? [],
    [activeVersionLines.snapshot],
  );
  /* Latest-value refs so the callbacks below can be identity-stable without
     closing over a stale project or a stale navigator. */
  const navigateToViewRef = useRef(navigateToView);
  navigateToViewRef.current = navigateToView;
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const startVersionLineOperationRef = useRef(startVersionLineOperation);
  startVersionLineOperationRef.current = startVersionLineOperation;
  const viewVersionLine = useCallback((name: string) => {
    setLinesSelectIntent(name);
    navigateToViewRef.current("version-lines");
  }, []);
  const switchToVersionLine = useCallback((name: string) => {
    const path = projectPathRef.current;
    if (path && startVersionLineOperationRef.current(path)) {
      setVersionLineSwitchTarget(name);
    }
  }, []);
  const createVersionLineFromVersion = useCallback(
    (version: { commit: string; shortCommit: string; subject: string }) => {
      const path = projectPathRef.current;
      if (path && startVersionLineOperationRef.current(path)) {
        setCreateLineRequest({
          forceSwitch: false,
          startVersion: {
            commit: version.commit,
            shortCommit: version.shortCommit,
            subject: version.subject,
          },
        });
      }
    },
    [],
  );
  const clearHistoryScopeLineIntent = useCallback(() => setHistoryScopeLineIntent(null), []);
  const clearHistorySelectCommitIntent = useCallback(() => setHistorySelectCommitIntent(null), []);
  const clearLinesSelectIntent = useCallback(() => setLinesSelectIntent(null), []);

  // Dropping a folder on the window opens it. Session lifecycle wiring, like
  // the watcher above, so it lives here rather than in a feature: it ends in
  // the same `handleOpenProject` every other route uses, and therefore in the
  // same validation, the same already-open handling and the same "that folder
  // isn't a project yet" recovery. The ref keeps the subscription registered
  // once while still calling the current handler, which closes over state.
  const handleOpenProjectRef = useRef(handleOpenProject);
  handleOpenProjectRef.current = handleOpenProject;

  useEffect(() => {
    // Outside Tauri (tests, a plain `vite dev`) the webview emits no drag
    // events at all; every other way into a project is unaffected.
    if (!("__TAURI_INTERNALS__" in window)) {
      return undefined;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsFolderDropTarget(true);
          return;
        }
        setIsFolderDropTarget(false);
        if (event.payload.type !== "drop") {
          return;
        }
        // One drop opens one project, which is what the overlay promises
        // while the pointer is still over the window ("drop a folder"). The
        // rest of a multi-folder drag is ignored rather than opening a queue
        // of projects the user did not ask to switch between.
        const [droppedPath] = event.payload.paths;
        if (droppedPath) void handleOpenProjectRef.current(droppedPath);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // No drop affordance, no error surfaced: the folder picker, the
        // recent list and the clone flow are all still there.
      });
    return () => {
      cancelled = true;
      unlisten?.();
      setIsFolderDropTarget(false);
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
    const updateWatcherRegistration = (
      path: string,
      registration: WatcherRegistration | null,
    ): void => {
      setWatcherRegistrations((current) => {
        const existing = current[path];
        if (registration === null) {
          if (!existing) return current;
          const next = { ...current };
          delete next[path];
          return next;
        }
        if (existing?.epoch === registration.epoch && existing.state === registration.state) {
          return current;
        }
        return { ...current, [path]: registration };
      });
    };
    // The preference is honored by the plan, not by this loop: with watching
    // off the plan unregisters everything and asks for nothing, so turning it
    // back on re-registers without the project being reopened.
    const plan = planWatcherChanges(
      watchedSessionsRef.current,
      sessionsState.order.map((id) => ({ path: id, epoch: sessionsState.byId[id]?.epoch })),
      watchProjects,
    );
    for (const { path, epoch } of plan.unwatch) {
      void invoke("unwatch_repository", { path, sessionEpoch: epoch }).catch(() => {});
      delete watchedSessionsRef.current[path];
      updateWatcherRegistration(path, null);
    }
    for (const { path, epoch } of plan.watch) {
      watchedSessionsRef.current[path] = epoch;
      updateWatcherRegistration(path, { epoch, state: "starting" });
      void invoke<boolean>("watch_repository", { path, sessionEpoch: epoch })
        .then((watching) => {
          if (watchedSessionsRef.current[path] !== epoch) return;
          if (watching) {
            updateWatcherRegistration(path, { epoch, state: "watching" });
          } else {
            delete watchedSessionsRef.current[path];
            updateWatcherRegistration(path, { epoch, state: "unavailable" });
          }
        })
        .catch(() => {
          if (watchedSessionsRef.current[path] === epoch) {
            delete watchedSessionsRef.current[path];
            updateWatcherRegistration(path, { epoch, state: "unavailable" });
          }
        });
    }
  }, [hasCompletedSessionRestore, watcherSessionKey, watchProjects]);

  // Turning watching back on leaves the open project exactly as stale as the
  // moment it was turned off: re-registering only catches what changes next.
  // One read of the same facts a watcher invalidation would have driven closes
  // that gap, without asking the user to reopen the project.
  const wasWatchingRef = useRef(watchProjects);
  useEffect(() => {
    const wasWatching = wasWatchingRef.current;
    wasWatchingRef.current = watchProjects;
    if (!watchProjects || wasWatching || !hasCompletedSessionRestore || !projectPath) {
      return;
    }
    void repositoryReads.refreshAll(projectRuntime, projectRuntime.getSnapshot(), projectPath);
  }, [watchProjects, hasCompletedSessionRestore, projectPath, projectRuntime, repositoryReads]);

  const automaticRemoteCheckEligible = Boolean(
    hasCompletedSessionRestore &&
    project?.headState === "branch" &&
    project.branch &&
    teamSync.status?.state !== "noRemote" &&
    teamSync.status?.state !== "noUpstream" &&
    teamSync.status?.state !== "unborn" &&
    teamSync.status?.state !== "detached",
  );
  useAutomaticRemoteCheck({
    intervalMinutes: remoteCheckInterval,
    projectId: projectPath,
    sessionEpoch: activeSession?.epoch ?? null,
    eligible: automaticRemoteCheckEligible,
    // The one place that records notifications from a check, because it is the
    // one check nobody asked for. A manual check has the person who pressed it
    // watching the status bar for its answer; telling them about it afterwards
    // in an inbox would be reporting the news to its own author.
    onCheck: () => {
      if (!projectPath || !activeSession?.epoch) return;
      const projectId = projectPath;
      const projectName = activeSession.project.name;
      // A check already in flight is one somebody pressed and is watching, and
      // the controller would hand this tick that same promise — recording from
      // it would report the news back to its own author. Skipping costs
      // nothing: the deduplicated request was never going to reach the network
      // twice, and the tick that started it records for both.
      if (selectTeamSyncState(projectRuntime.getSnapshot(), projectId).isCheckingRemote) return;
      void syncController
        .check(projectRuntime, { projectId, sessionEpoch: activeSession.epoch }, mapSyncError)
        .then((status) => {
          if (status) {
            // `behind` alone would also match a diverged upstream, and Rust
            // deliberately offers no "review and get" for that: the update is
            // fast-forward-only and would refuse. Telling someone about
            // versions and handing them a button that declines is worse than
            // the status bar saying "diverged" on its own, so this waits for
            // the task that can actually integrate a diverged line.
            if (status.state === "behind" && status.behind > 0) {
              notificationCenter.notify({
                projectId,
                projectName,
                details: {
                  kind: "teamChangesAvailable",
                  behind: status.behind,
                  remoteCommit: status.remoteCommit,
                },
              });
            }
            return;
          }
          // `check` resolves `null` for a failure *and* for a superseded
          // request, so the failure is read back from the state the controller
          // committed rather than inferred from the null. A superseded request
          // leaves no error, and therefore records nothing.
          const { error } = selectTeamSyncState(projectRuntime.getSnapshot(), projectId);
          if (error) {
            notificationCenter.notify({
              projectId,
              projectName,
              details: { kind: "remoteCheckFailed", reason: error },
            });
          }
        });
    },
  });

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
    historyController,
    versionLinesController,
    syncController,
    mapSyncError,
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
    syncController.close(projectRuntime, { projectId: id, sessionEpoch: closingSession.epoch });
    repositoryReads.close(id, closingSession.epoch);
    delete watchedSessionsRef.current[id];
    versionLinesController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    historyController.close({ projectId: id, sessionEpoch: closingSession.epoch });
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

  /** Every dialog that installs its own focus trap, not just the ones that
   * block project mutations. Opening a second on top of the first leaves two
   * Escape handlers and two traps competing for focus. */
  const hasOpenDialog =
    hasBlockingDialog ||
    isAboutOpen ||
    isChangelogOpen ||
    isAppUpdateOpen ||
    isShortcutsOpen ||
    isCloseConfirmOpen ||
    isOpenErrorDialogOpen ||
    issueReport.failedUrl !== null ||
    isPaletteOpen;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (hasOpenDialog) return;
        openPalette();
        return;
      }
      // The desktop convention for collapsing a sidebar. Guarded like the
      // preferences shortcut: while a dialog owns the screen, rearranging the
      // chrome behind it is never what the keystroke meant.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        if (hasOpenDialog) {
          return;
        }
        event.preventDefault();
        setIsSidebarHidden((hidden) => !hidden);
        return;
      }
      // The desktop convention for preferences. Not taken while any dialog
      // owns the screen, so it cannot stack a second focus trap on top of one.
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        if (hasOpenDialog) {
          return;
        }
        event.preventDefault();
        openSettings();
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
  }, [sessionsState, hasBlockingDialog, hasOpenDialog, view]);

  const commands: AppCommand[] = [
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
        // One entry per section as well as the plain "Go to Settings", which
        // lands on General. These are the shortcut for someone who knows where
        // they are going, and the reason the plain open no longer needs to
        // remember anything.
        return [
          {
            id: `open-${destination.id}`,
            label: t[destination.commandLabelKey],
            action: () => openSettings(),
          },
          ...SETTINGS_SECTIONS.map((section) => ({
            id: `open-settings-${section}`,
            label: t.commandGoSettingsSection(settingsSectionLabel(section, t)),
            action: () => openSettings(section),
          })),
        ];
      }
      if (screen === null) {
        return [];
      }
      const entries: AppCommand[] = [
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
          {
            id: "clone-project",
            label: t.commandCloneProject,
            action: () => setIsCloneOpen(true),
          },
          {
            id: "create-project",
            label: t.commandCreateProject,
            action: () => setInitializeDialogRequest({ mode: "new-folder" }),
          },
        ]
      : []),
    ...(project && !hasBlockingDialog
      ? [{ id: "close-project", label: t.commandCloseActiveProject, action: requestCloseActiveProject }]
      : []),
    ...(project && activeSession && !hasBlockingDialog
      ? [
          {
            id: "check-local-changes",
            label: t.commandCheckLocalChanges,
            action: () => void checkWorkingTree(activeSession.id, activeSession.epoch),
          },
          ...(project.headState === "branch" && project.branch
            ? [{
                id: "check-remote-changes",
                label: t.commandCheckRemoteChanges,
                action: () => void syncController.check(
                  projectRuntime,
                  { projectId: activeSession.id, sessionEpoch: activeSession.epoch },
                  mapSyncError,
                ),
              }]
            : []),
          ...(view === "history"
            ? [{
                id: "refresh-history",
                label: t.commandRefreshHistory,
                action: () => void historyController.refresh({
                  projectId: activeSession.id,
                  sessionEpoch: activeSession.epoch,
                }),
              }]
            : []),
          ...(view === "version-lines"
            ? [{
                id: "refresh-version-lines",
                label: t.commandRefreshVersionLines,
                action: () => void versionLinesController.refresh({
                  projectId: activeSession.id,
                  sessionEpoch: activeSession.epoch,
                }),
              }]
            : []),
        ]
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
    { id: "theme-system", label: t.commandUseSystemTheme, action: () => changeTheme("system") },
    { id: "theme-light", label: t.commandUseLightTheme, action: () => changeTheme("light") },
    { id: "theme-dark", label: t.commandUseDarkTheme, action: () => changeTheme("dark") },
    ...(project
      ? [
          {
            id: "project-settings",
            label: t.projectSettingsTitle,
            action: () => openProjectSettings(),
          },
        ]
      : []),
    { id: "changelog", label: t.changelogTitle, action: () => setIsChangelogOpen(true) },
    {
      id: "check-app-updates",
      label: t.commandCheckAppUpdates,
      action: () => {
        setIsAppUpdateOpen(true);
        void appUpdatesController.check();
      },
    },
    { id: "about", label: t.aboutGitOdile, action: () => setIsAboutOpen(true) },
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
      isFavourite: favouriteProjectIds.has(id),
    };
  });
  /**
   * What the collapsed rail's jump menu offers. Favourites only — the menu is
   * a shortcut, and a shortcut that lists everything is just the switcher
   * again in a worse place.
   *
   * Until the first project is favourited it lists them all, so the menu is
   * useful before anyone has been taught the feature exists. The alternative
   * was an empty group with nothing on screen explaining why it was empty or
   * how to fill it.
   */
  const favouriteEntries = switcherEntries.filter((entry) => entry.isFavourite);
  const jumpMenuEntries = orderByFavourite(
    favouriteEntries.length > 0 ? favouriteEntries : switcherEntries,
  );
  const closeTargetSession = closeTargetId ? sessionsState.byId[closeTargetId] : null;

  const toRailItem = (destination: (typeof NAV_DESTINATIONS)[number]): RailNavItem => {
    const { screen } = destination;
    const isDisabled = screen === null || (destination.requiresProject && !project);
    return {
      id: destination.id,
      label: t[destination.labelKey],
      icon: destination.icon,
      isActive: screen !== null && view === screen,
      isDisabled,
      isVisibleInRail: navigationPreferences.visibleDestinationIds.includes(destination.id),
      disabledLabel:
        isDisabled && destination.disabledLabelKey ? t[destination.disabledLabelKey] : undefined,
      onSelect: screen ? () => navigateToView(screen) : undefined,
    };
  };
  // Keep the full product map in the rail model. RailNav decides which entries
  // stay visible from the stored preference and available height; everything
  // else remains reachable in More without duplicating navigation policy here.
  const destinationOrder = new Map(
    navigationPreferences.destinationOrderIds.map((id, index) => [id, index]),
  );
  const orderedProjectNavDestinations = [...PROJECT_NAV_DESTINATIONS].sort(
    (left, right) =>
      (destinationOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (destinationOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const railDestinations = orderedProjectNavDestinations.map(toRailItem);

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
    // Wraps the whole shell rather than the Changes screen: the pending
    // versions list under Overview renders diffs too, through an entirely
    // different panel.
    <DiffPreferencesProvider value={diffPreferences}>
    <div
      className={
        `app-window` +
        (navigationPreferences.displayMode === "icons-only" ? " app-window--icons-only" : "") +
        (isSidebarHidden ? " app-window--sidebar-hidden" : "")
      }
    >
      <span className="visually-hidden" role="status" aria-live="polite">
        {projectAnnouncement}
      </span>
      <header className="window-titlebar">
        {/* The mark is the About affordance, the way it is in every desktop
            app: identity in the corner, and clicking identity tells you what
            the thing is. Deliberately unadvertised — no tooltip, no fill —
            because it is the alternative route, not the signposted one; the
            menu and the palette are where someone looks when they do not
            already know the convention. The accessible name stays: it is
            invisible to a sighted user, so it costs the quiet nothing, and
            without it the button is unnamed to a screen reader.

            `data-tauri-drag-region` stays on the wrapper only — Tauri reads
            the attribute off the element under the pointer, so the button
            keeps its click and the chrome around it still drags the window. */}
        <div className="window-titlebar__brand" data-tauri-drag-region>
          <button
            className="window-titlebar__mark"
            type="button"
            aria-label={t.aboutGitOdile}
            onClick={() => setIsAboutOpen(true)}
          >
            {CROCODILE_MARK}
          </button>
        </div>

        <div className="window-titlebar__actions">
          <TitlebarMenu
            onOpenAbout={() => setIsAboutOpen(true)}
            onOpenChangelog={() => setIsChangelogOpen(true)}
            onCheckAppUpdates={() => {
              setIsAppUpdateOpen(true);
              void appUpdatesController.check();
            }}
            onOpenProject={() => void handleOpenProject()}
            onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
            onCloneProject={() => setIsCloneOpen(true)}
            onCloseProject={requestCloseActiveProject}
            onOpenSettings={() => openSettings()}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            hasProject={project !== null}
            isOpeningProject={isOpening}
            canReloadWindow={!hasUnsettledOperation(sessionsState)}
            onReportIssue={() => void issueReport.report()}
            isReportingIssue={issueReport.isOpening}
          />
          {/* Sits with the menu rather than in the rail it collapses: a
              control that hides its own container would vanish with it, and
              the way back has to stay where it was.

              While collapsed it is also the way back *without* committing:
              resting on it slides the rail out so a destination can be picked
              and the rail put away again, leaving the click for when someone
              actually wants it back for good. */}
          <button
            ref={sidebarToggleRef}
            className="titlebar-icon-button titlebar-sidebar-toggle"
            type="button"
            aria-pressed={isSidebarHidden}
            aria-label={isSidebarHidden ? t.titlebarShowSidebar : t.titlebarHideSidebar}
            data-tooltip={isSidebarHidden ? t.titlebarShowSidebar : t.titlebarHideSidebar}
            onMouseEnter={isSidebarHidden ? openJumpMenu : undefined}
            onMouseLeave={isSidebarHidden ? scheduleJumpClose : undefined}
            onClick={() => {
              closeJumpMenu();
              setIsSidebarHidden((hidden) => !hidden);
            }}
          >
            {isSidebarHidden ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
          {isSidebarHidden && isJumpMenuOpen && createPortal(
            <div
              ref={jumpMenuRef}
              className="app-menu sidebar-jump__menu"
              role="menu"
              aria-label={t.navProjectAriaLabel}
              style={jumpMenuStyle}
              onMouseEnter={openJumpMenu}
              onMouseLeave={scheduleJumpClose}
              onKeyDown={(event) => handlePopupMenuKeyDown(event, jumpMenuRef.current, closeJumpMenu)}
            >
              {railDestinations.map((item) => (
                <button
                  key={item.id}
                  className={`app-menu__item${item.isActive ? " app-menu__item--selected" : ""}`}
                  type="button"
                  role="menuitem"
                  disabled={item.isDisabled}
                  aria-current={item.isActive ? "page" : undefined}
                  aria-label={item.disabledLabel}
                  onClick={() => {
                    closeJumpMenu();
                    item.onSelect?.();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}

              <div className="sidebar-jump__divider" role="separator" />

              {/* The project group, flattened. The rail spends an avatar and a
                  "+" on two menus of their own; a list this short can just say
                  what those menus would have said. */}
              {jumpMenuEntries.map((entry) => (
                <button
                  key={entry.id}
                  className={`app-menu__item${entry.id === sessionsState.activeId ? " app-menu__item--selected" : ""}`}
                  type="button"
                  role="menuitem"
                  disabled={hasBlockingDialog}
                  aria-current={entry.id === sessionsState.activeId ? "true" : undefined}
                  aria-label={t.projectSwitcherRailTrigger(entry.name)}
                  onClick={() => {
                    closeJumpMenu();
                    activateSession(entry.id);
                  }}
                >
                  <span
                    className="sidebar-jump__avatar"
                    aria-hidden="true"
                    style={{ backgroundColor: avatarColorVar(entry.id) }}
                  >
                    {avatarInitials(entry.name)}
                  </span>
                  <span>{entry.name}</span>
                </button>
              ))}
              <button
                className="app-menu__item"
                type="button"
                role="menuitem"
                onClick={() => {
                  closeJumpMenu();
                  setInitializeDialogRequest({ mode: "new-folder" });
                }}
              >
                <FolderInput aria-hidden="true" />
                <span>{t.projectSwitcherCreateProject}</span>
              </button>
              <button
                className="app-menu__item"
                type="button"
                role="menuitem"
                disabled={isOpening}
                onClick={() => {
                  closeJumpMenu();
                  void handleOpenProject();
                }}
              >
                <FolderPlus aria-hidden="true" />
                <span>
                  {switcherEntries.length > 0 ? t.overviewOpenAnotherProject : t.overviewOpenProject}
                </span>
              </button>
              <button
                className="app-menu__item"
                type="button"
                role="menuitem"
                onClick={() => {
                  closeJumpMenu();
                  setIsCloneOpen(true);
                }}
              >
                <CloudDownload aria-hidden="true" />
                <span>{t.projectSwitcherCloneProject}</span>
              </button>

              <div className="sidebar-jump__divider" role="separator" />

              {/* The foot, in the same order the rail stacks it. */}
              {NAV_DESTINATIONS.filter((destination) => destination.section === "application").map(
                (destination) => {
                  const { screen, overlay } = destination;
                  const isActive =
                    overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                  return (
                    <button
                      key={destination.id}
                      className={`app-menu__item${isActive ? " app-menu__item--selected" : ""}`}
                      type="button"
                      role="menuitem"
                      disabled={screen === null && overlay === undefined}
                      aria-current={screen !== null && isActive ? "page" : undefined}
                      onClick={() => {
                        closeJumpMenu();
                        if (overlay === "settings") openSettings();
                        else if (screen) navigateToView(screen);
                      }}
                    >
                      {destination.icon}
                      <span>{t[destination.labelKey]}</span>
                    </button>
                  );
                },
              )}
              <button
                className="app-menu__item"
                type="button"
                role="menuitem"
                disabled
                aria-label={t.navAccountTitle}
              >
                <UserRound aria-hidden="true" />
                <span>{t.navAccountTitle}</span>
              </button>
            </div>,
            document.body,
          )}
          <button
            className="titlebar-icon-button"
            type="button"
            ref={paletteTriggerRef}
            aria-label={t.titlebarOpenCommandPalette}
            data-tooltip={t.titlebarJumpToHint}
            onClick={openPalette}
          >
            <Search aria-hidden="true" />
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
            {effectiveTheme === "dark" ? (
              <Sun className="titlebar-theme-icon" aria-hidden="true" />
            ) : (
              <Moon className="titlebar-theme-icon" aria-hidden="true" />
            )}
          </button>
        </div>

        <div
          className="window-titlebar__drag"
          data-tauri-drag-region
          onDoubleClick={() => performWindowAction(() => appWindow.toggleMaximize())}
        />

        {/* Between the drag region and the window buttons: the inbox belongs
            with the window furniture, not in the action row on the left, and
            this is where the release badge used to sit before task 086 moved
            it to the status bar. */}
        <NotificationCenter
          notifications={notificationCenter.notifications}
          unreadCount={notificationCenter.unreadCount}
          isEnabled={notificationsEnabled}
          onOpened={notificationCenter.markAllRead}
          onClear={notificationCenter.clear}
          onReviewTeamChanges={reviewTeamChangesFromNotification}
          onReviewAppUpdate={() => setIsAppUpdateOpen(true)}
          onOpenSettings={() => openSettings("notifications")}
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

      <main
        className={`app-shell${view === "changes" || view === "history" || view === "version-lines" ? " app-shell--internal-scroll" : ""}`}
      >
        {/* Read by `usePortalFlyout`: every menu the rail opens flies out from
            this panel's edge rather than from the button inside it. */}
        <aside className="sidebar" data-flyout-anchor="">
          <RailNav
            ariaLabel={t.navProjectAriaLabel}
            moreLabel={t.navMore}
            customizeLabel={t.navCustomizeNavigation}
            items={railDestinations}
            displayMode={navigationPreferences.displayMode}
            onCustomize={() => openSettings("navigation")}
          />

          {/* Slack-like hierarchy: the destinations answer "where in this
              project am I", everything below the rule answers "which project,
              and which app-level control". Spacing alone used to carry that
              split; at 88px the eye reads a column of evenly stacked circles
              instead, so the rule states it. */}
          <hr className="sidebar-divider" />

          <div className="sidebar-project-section" data-flyout-group-anchor="">
            <ProjectSwitcherRail
              entries={switcherEntries}
              activeId={sessionsState.activeId}
              canSwitch={!hasBlockingDialog}
              isOpening={isOpening}
              onActivate={activateSession}
              onClose={requestCloseSession}
              onOpenAnother={() => void handleOpenProject()}
              onCreate={() => setInitializeDialogRequest({ mode: "new-folder" })}
              onClone={() => setIsCloneOpen(true)}
              onToggleFavourite={toggleFavouriteProject}
              onOpenProjectSettings={openProjectSettings}
              onPrefetchProjectSettings={prefetchProjectSettings}
            />
          </div>

          <nav aria-label={t.navApplicationAriaLabel} className="sidebar-foot">
            {NAV_DESTINATIONS.filter((destination) => destination.section === "application").map((destination) => {
              const { screen, overlay } = destination;
              const isActive = overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
              const label = t[destination.labelKey];
              return (
                <button
                  key={destination.id}
                  className={`sidebar-round${isActive ? " sidebar-round--active" : ""}`}
                  type="button"
                  disabled={screen === null && overlay === undefined}
                  aria-current={screen !== null && isActive ? "page" : undefined}
                  aria-haspopup={overlay ? "dialog" : undefined}
                  aria-expanded={overlay ? isSettingsOpen : undefined}
                  data-tooltip={label}
                  // These carry no visible name in either display mode, so the
                  // accessible name lives on the control itself rather than in
                  // a caption that only one mode renders.
                  aria-label={label}
                  onClick={overlay === "settings" ? () => openSettings() : screen ? () => navigateToView(screen) : undefined}
                >
                  {destination.icon}
                </button>
              );
            })}
            {/* Signing in is not built yet, but its place in the rail is: it
                sits with Settings the way an account always does, disabled
                and saying so, rather than appearing later and pushing the
                rail's furniture around. */}
            <button
              className="sidebar-round"
              type="button"
              aria-disabled="true"
              aria-label={t.navAccountTitle}
              data-tooltip={t.navAccountTitle}
            >
              <UserRound aria-hidden="true" />
            </button>
          </nav>
        </aside>

        <section
          {...autoHideScrollbarProps<HTMLElement>()}
          className={`workspace auto-hide-scrollbar${view === "changes" ? " workspace--changes" : ""}${view === "history" ? " workspace--history" : ""}${view === "version-lines" ? " workspace--version-lines" : ""}`}
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
              onCreate={() => setInitializeDialogRequest({ mode: "new-folder" })}
              onClone={() => setIsCloneOpen(true)}
              onToggleFavourite={toggleFavouriteProject}
              onOpenProjectSettings={openProjectSettings}
              onPrefetchProjectSettings={prefetchProjectSettings}
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
                    onClick={overlay === "settings" ? () => openSettings() : () => screen && navigateToView(screen)}
                  >
                    <span aria-hidden="true">{destination.icon}</span>
                    {t[destination.labelKey]}
                  </button>
                );
              })}
            </nav>
          </div>

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
                  onCheckLocalChanges={() => {
                    if (projectPath) void checkWorkingTree(projectPath);
                  }}
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
                  onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
                  onCloneProject={() => setIsCloneOpen(true)}
                  recentProjects={recentProjectEntries}
                  onOpenRecentProject={(path) => void handleOpenProject(path)}
                  onToggleFavouriteRecentProject={toggleFavouriteProject}
                  onForgetRecentProject={(path) => setRecentProjects(forgetRecentProject(path))}
                  canPublish={canPublish}
                  onPublish={() => openPublishDialog()}
                  onPublishUpTo={(commit) => openPublishDialog(commit)}
                  pendingVersions={pendingVersions}
                  pendingVersionsError={pendingVersionsError}
                  versionLines={activeVersionLines.snapshot}
                  isLoadingVersionLines={activeVersionLines.isLoading}
                  favouriteVersionLines={favouriteVersionLines}
                  onToggleFavouriteVersionLine={toggleFavouriteVersionLine}
                  onQuickSwitchVersionLine={(target) => {
                    if (projectPath && startVersionLineOperation(projectPath)) {
                      setVersionLineSwitchTarget(target);
                    }
                  }}
                  onQuickCreateVersionLine={(forceSwitch) => {
                    if (projectPath && startVersionLineOperation(projectPath)) {
                      setCreateLineRequest({ forceSwitch });
                    }
                  }}
                  onOpenProjectSettings={() => openProjectSettings()}
                  onPrefetchProjectSettings={() => prefetchProjectSettings()}
                  onGoToVersionLines={() => navigateToView("version-lines")}
                  onCopyPathError={() =>
                    showErrorDialog(t.overviewCopyPathFailedTitle, t.overviewCopyPathFailedMessage)
                  }
                  onOpenSaveVersion={() => startSessionOperation("save")}
                  teamSync={teamSync}
                  onCheckTeamChanges={() => {
                    if (!activeSession) return;
                    void syncController.check(
                      projectRuntime,
                      { projectId: activeSession.id, sessionEpoch: activeSession.epoch },
                      mapSyncError,
                    );
                  }}
                  onReviewAndGetTeamChanges={() => startSessionOperation("sync")}
                  historyController={historyController}
                  onOpenHistory={() => navigateToView("history")}
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
                          controller={changesController}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          watcherState={activeWatcherState}
                          confirmBeforeDiscarding={confirmDiscard}
                          runGitHooks={runGitHooks}
                          onRefresh={() => projectPath && void checkWorkingTree(projectPath)}
                          onOpenSettings={() => openSettings("general")}
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
                          onBeginDiscard={() => startSessionOperation("discard")}
                          onDiscardClose={() => finishSessionOperation(project.path)}
                          onDiscardPhaseChange={(phase) => {
                            dispatchSessions({
                              type: "setOperationPhase",
                              id: project.path,
                              phase,
                            });
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
                          watcherState={activeWatcherState}
                          onOpenSettings={() => openSettings("general")}
                          onChanged={() => void handleVersionLineChanged(project.path)}
                          onOperationStart={() => startVersionLineOperation(project.path)}
                          onOperationFinish={() => finishSessionOperation(project.path)}
                          onOperationPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
                          onSaveVersion={() => {
                            startSessionOperation("save");
                            navigateToView("changes");
                          }}
                          onOpenChanges={() => navigateToView("changes")}
                          onOpenHistory={(name, commit) => {
                            setHistoryScopeLineIntent(name);
                            setHistorySelectCommitIntent(commit ?? null);
                            navigateToView("history");
                          }}
                          autoOpenCreate={versionLinesAutoOpenCreate}
                          onAutoOpenCreateHandled={() => setVersionLinesAutoOpenCreate(false)}
                          selectLineIntent={linesSelectIntent}
                          onSelectLineIntentHandled={clearLinesSelectIntent}
                        />
                      </Suspense>
                    ),
                    history: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <HistoryScreen
                          controller={historyController}
                          projectPath={project.path}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          watcherState={activeWatcherState}
                          lines={versionLineNames}
                          scopeLineIntent={historyScopeLineIntent}
                          selectCommitIntent={historySelectCommitIntent}
                          onSelectCommitIntentHandled={clearHistorySelectCommitIntent}
                          onScopeLineIntentHandled={clearHistoryScopeLineIntent}
                          onViewLine={viewVersionLine}
                          onSwitchLine={switchToVersionLine}
                          onCreateLineFromVersion={createVersionLineFromVersion}
                          onOpenSettings={() => openSettings("general")}
                        />
                      </Suspense>
                    ),
                  }
                : {}),
            }}
          />
        </section>

        {/* On every screen, Overview included: a strip that came and went
            would make the window resize under the pointer on each navigation,
            and the one place state is always visible is worth more than the
            small duplication with Overview's own cards. */}
        <StatusBar
          project={project}
          workingTree={workingTree}
          workingTreeError={workingTreeError}
          isCheckingChanges={isCheckingChanges}
          versionLines={activeVersionLines.snapshot}
          isLoadingVersionLines={activeVersionLines.isLoading}
          favouriteVersionLines={favouriteVersionLines}
          onToggleFavouriteVersionLine={toggleFavouriteVersionLine}
          teamSync={teamSync}
          onSwitchVersionLine={(target) => {
            if (projectPath && startVersionLineOperation(projectPath)) {
              setVersionLineSwitchTarget(target);
            }
          }}
          onCreateVersionLine={() => {
            if (projectPath && startVersionLineOperation(projectPath)) {
              setCreateLineRequest({ forceSwitch: false });
            }
          }}
          onSeeAllVersionLines={() => navigateToView("version-lines")}
          onCheckTeamChanges={() => {
            if (!activeSession) return;
            void syncController.check(
              projectRuntime,
              { projectId: activeSession.id, sessionEpoch: activeSession.epoch },
              mapSyncError,
            );
          }}
          onOpenChangelog={() => setIsChangelogOpen(true)}
        />
      </main>

      {/* Feedback about a gesture in progress, not app chrome: it exists only
          while something is actually being dragged over the window, never
          takes the pointer, and stays out of the accessibility tree because
          there is no keyboard or screen-reader equivalent of a drag to
          narrate. It is suppressed under a blocking dialog, which is exactly
          when a drop is ignored. */}
      {isFolderDropTarget && !hasBlockingDialog && (
        <div className="folder-drop-overlay" aria-hidden="true">
          <div className="folder-drop-overlay__panel">
            <span className="folder-drop-overlay__icon">
              <FolderOpen />
            </span>
            <p className="folder-drop-overlay__title">{t.dropFolderTitle}</p>
            <p className="folder-drop-overlay__hint">{t.dropFolderHint}</p>
          </div>
        </div>
      )}

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        commands={commands}
        contextKey={sessionsState.activeId}
      />

      <CloneDialog
        isOpen={isCloneOpen}
        controller={cloneController}
        onClose={() => setIsCloneOpen(false)}
        onVerifiedClone={handleVerifiedClone}
      />

      {initializeDialogRequest && (
        <InitializeProjectDialog
          isOpen
          initialMode={initializeDialogRequest.mode}
          initialExistingPath={initializeDialogRequest.existingPath}
          controller={initializeProjectController}
          saveVersionController={initialSaveVersionController}
          defaultBranchName={defaultBranch.name ?? DEFAULT_BRANCH_FALLBACK}
          runHooks={runGitHooks}
          onClose={() => setInitializeDialogRequest(null)}
          onInitialized={handleInitializedProject}
          onProjectChanged={handleMutationSucceeded}
          onOpenIdentitySettings={() => openSettings("git")}
        />
      )}

      {publishDialogSession && (
        <Suspense fallback={null}>
          <PublishDialog
            isOpen
            projectPath={publishDialogSession.project.path}
            sessionEpoch={publishDialogSession.epoch}
            upTo={publishUpTo ?? undefined}
            runHooks={runGitHooks}
            onClose={() => {
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
            }}
            onPublished={(result) => {
              // Recorded already-read by the kind table: this is a receipt for
              // something the user just watched succeed, so it belongs in the
              // list without lighting the badge.
              notificationCenter.notify({
                projectId: publishDialogSession.project.path,
                projectName: publishDialogSession.project.name,
                details: {
                  kind: "changesPublished",
                  versionCount: result.publishedCount,
                  destination: `${result.target.remote}/${result.target.destinationBranch}`,
                },
              });
              syncController.supersede(projectRuntime, {
                projectId: publishDialogSession.project.path,
                sessionEpoch: publishDialogSession.epoch,
              });
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

      {getTeamDialogSession && (
        <GetTeamChangesDialog
          isOpen
          controller={syncController}
          projectPath={getTeamDialogSession.project.path}
          sessionEpoch={getTeamDialogSession.epoch}
          onClose={() => {
            finishSessionOperation(getTeamDialogSession.id);
            setGetTeamDialogSessionId(null);
          }}
          onApplied={async (result) => {
            const query = {
              projectId: getTeamDialogSession.project.path,
              sessionEpoch: getTeamDialogSession.epoch,
            };
            syncController.commitGetResult(projectRuntime, query, result);
            dispatchSessions({
              type: "setChangesSelection",
              id: getTeamDialogSession.id,
              selection: EMPTY_CHANGES_SELECTION,
            });
            await repositoryReads.refreshAfterMutation(
              projectRuntime,
              projectRuntime.getSnapshot(),
              getTeamDialogSession.project.path,
            );
          }}
          onPhaseChange={(phase) =>
            dispatchSessions({
              type: "setOperationPhase",
              id: getTeamDialogSession.id,
              phase,
            })
          }
        />
      )}

      {project && versionLineSwitchTarget && (
        <Suspense fallback={null}>
          <SwitchVersionLineDialog
            isOpen
            projectPath={project.path}
            sessionEpoch={activeSession?.epoch ?? ""}
            target={versionLineSwitchTarget}
            onClose={() => {
              setVersionLineSwitchTarget(null);
              finishSessionOperation(project.path);
            }}
            onSwitched={(snapshot) => {
              versionLinesController.commit(activeVersionLinesQuery, snapshot);
              setVersionLineSwitchTarget(null);
              void handleVersionLineChanged(project.path);
              finishSessionOperation(project.path);
            }}
            onSaveVersion={() => {
              startSessionOperation("save");
              navigateToView("changes");
            }}
            onCreateWithWork={() => {
              if (startVersionLineOperation(project.path)) {
                setCreateLineRequest({ forceSwitch: false });
              }
            }}
            onPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {project && createLineRequest && (
        <Suspense fallback={null}>
          <CreateVersionLineDialog
            isOpen
            projectPath={project.path}
            sessionEpoch={activeSession?.epoch ?? ""}
            forceSwitch={createLineRequest.forceSwitch}
            startVersion={createLineRequest.startVersion ?? null}
            onClose={() => {
              setCreateLineRequest(null);
              finishSessionOperation(project.path);
            }}
            onCreated={(snapshot) => {
              versionLinesController.commit(activeVersionLinesQuery, snapshot);
              setCreateLineRequest(null);
              void handleVersionLineChanged(project.path);
              finishSessionOperation(project.path);
            }}
            onPhaseChange={(phase) => setVersionLineOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {project && activeSession && (
        <SaveVersionDialog
          isOpen={saveDialogSessionId === sessionsState.activeId}
          projectPath={project.path}
          sessionEpoch={activeSession.epoch}
          selectedPaths={null}
          runHooks={runGitHooks}
          onClose={closeSaveDialog}
          onSaved={() => void handleMutationSucceeded(project.path)}
          onPublishNow={() => openPublishDialog()}
          onPhaseChange={setSaveDialogPhase}
        />
      )}

      <AppOverlays
        issueReport={issueReport}
        projectSettings={{
          isOpen: isProjectSettingsOpen,
          setOpen: setIsProjectSettingsOpen,
          project:
            project && activeSession
              ? { path: project.path, sessionEpoch: activeSession.epoch, name: project.name }
              : null,
          section: projectSettingsSection,
          setSection: setProjectSettingsSection,
          cache: projectSettingsCache,
        }}
        settings={{
          isOpen: isSettingsOpen,
          setOpen: setIsSettingsOpen,
          theme,
          setTheme: changeTheme,
          reducedMotion,
          setReducedMotion,
          section: settingsSection,
          setSection: setSettingsSection,
          gitTooling,
          reopenLastProject,
          setReopenLastProject,
          confirmCloseProject,
          setConfirmCloseProject,
          watchProjects,
          setWatchProjects,
          remoteCheckInterval,
          setRemoteCheckInterval,
          automaticAppUpdates,
          setAutomaticAppUpdates,
          appUpdates,
          appUpdatesController,
          confirmDiscard,
          setConfirmDiscard,
          notificationsEnabled,
          setNotificationsEnabled,
          runGitHooks,
          setRunGitHooks,
          navigationItems: orderedProjectNavDestinations.map((destination) => ({
            id: destination.id,
            label: t[destination.labelKey],
            icon: destination.icon,
          })),
          navigationPreferences,
          setNavigationPreferences,
          diffPreferences,
          setDiffPreferences,
          identity: gitIdentity,
          defaultBranch,
          lineEndings,
        }}
        about={{ isOpen: isAboutOpen, setOpen: setIsAboutOpen }}
        changelog={{ isOpen: isChangelogOpen, setOpen: setIsChangelogOpen }}
        appUpdate={{ isOpen: isAppUpdateOpen, setOpen: setIsAppUpdateOpen }}
        shortcuts={{ isOpen: isShortcutsOpen, setOpen: setIsShortcutsOpen }}
        closeConfirmation={{
          isOpen: isCloseConfirmOpen,
          setOpen: setIsCloseConfirmOpen,
          projectName: closeTargetSession?.project.name ?? null,
          onConfirm: () => {
            if (closeTargetId) {
              void performCloseSession(closeTargetId);
            }
          },
        }}
        error={{
          isOpen: isOpenErrorDialogOpen,
          setOpen: setIsOpenErrorDialogOpen,
          title: openErrorTitle,
          message: openError,
          recoveryAction: openErrorRecoveryAction,
        }}
      />
      <TooltipHost />
    </div>
    </DiffPreferencesProvider>
  );
}
