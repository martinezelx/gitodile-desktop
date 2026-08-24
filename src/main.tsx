import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Copy,
  Search,
  Square,
  UserRound,
  X,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  TriangleAlert,
} from "lucide-react";
import { useLanguage } from "./i18n";
import { isAppError, localizeAppError } from "./shared/i18n";
import type { RepositoryInvalidation } from "./repositoryInvalidation";
import { autoHideScrollbarProps } from "./shared/ui/autoHideScrollbar";
import { DiffPreferencesProvider, createChangesController, changesPort } from "./features/changes";
import { CloneDialog, clonePort, createCloneController, type CloneResult } from "./features/clone";
import {
  createInitializeProjectController,
  InitializeProjectDialog,
  initializeProjectPort,
  type InitializeProjectResult,
  type InitializeTargetKind,
} from "./features/initialize-project";
import { createSaveVersionController, saveVersionPort } from "./features/save-version";
import {
  createRepositoryController,
  createRepositoryReadCoordinator,
  repositoryPort,
  type RepositoryInfo,
} from "./features/repository";
import { createStatusController, statusPort, type StatusErrorMapper } from "./features/status";
import {
  createSyncController,
  EMPTY_TEAM_SYNC_STATE,
  GetTeamChangesDialog,
  syncPort,
  type SyncErrorMapper,
} from "./features/sync";
import {
  SETTINGS_SECTIONS,
  settingsPort,
  settingsSectionLabel,
  useGitIdentity,
  useGitTooling,
  useLineEndings,
  type NavigationPreferences,
  type SettingsSection,
  type ThemePreference,
} from "./features/settings";
import {
  createVersionLinesController,
  useVersionLinesState,
  versionLinesPort,
} from "./features/version-lines";
import { createHistoryController, historyPort } from "./features/history";
import { TooltipHost } from "./tooltip";
import { LoadingBar } from "./shared/ui/loadingBar";
import { AppOverlays } from "./app/AppOverlays";
import { CROCODILE_MARK } from "./app/branding";
import { CommandPalette, type AppCommand } from "./app/CommandPalette";
import {
  CONFIRM_CLOSE_PROJECT_DEFAULT,
  CONFIRM_CLOSE_PROJECT_STORAGE_KEY,
  CONFIRM_DISCARD_DEFAULT,
  CONFIRM_DISCARD_STORAGE_KEY,
  REOPEN_LAST_PROJECT_DEFAULT,
  REOPEN_LAST_PROJECT_STORAGE_KEY,
  WATCH_PROJECTS_DEFAULT,
  WATCH_PROJECTS_STORAGE_KEY,
  applyTheme,
  resolveEffectiveTheme,
  useStoredBoolean,
  useStoredDiffPreferences,
  useStoredNavigationPreferences,
  useThemePreference,
} from "./app/preferences";
import { startThemeFade, startThemeReveal } from "./app/themeTransition";
import { planWatcherChanges } from "./app/watcherPlan";
import { TitlebarMenu } from "./app/TitlebarMenu";
import { RailNav, type RailNavItem } from "./app/RailNav";
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
  ProjectSwitcherCompact,
  ProjectSwitcherRail,
  type ProjectSwitcherEntry,
} from "./projectSwitcher";
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
/** Kept as a local alias so the many `View` references below stay readable;
 * `screens.tsx` owns the definition and the registry that lists them. */
type View = ScreenId;

const PROJECT_NAV_DESTINATIONS = NAV_DESTINATIONS.filter(
  (destination) => destination.section === "project",
);
const DEFAULT_NAVIGATION_PREFERENCES = {
  visibleDestinationIds: PROJECT_NAV_DESTINATIONS.map((destination) => destination.id),
  displayMode: "icons-and-text",
} satisfies NavigationPreferences;

/** Suspense fallback for a lazily-loaded view (see `ChangesPanel` below).
 * Only ever visible on the first navigation into that view before its chunk
 * has been fetched — normally masked entirely by the idle-time prefetch in
 * `main.tsx`. */
function ViewLoadingFallback(): React.JSX.Element {
  const { t } = useLanguage();
  return <LoadingBar label={t.commonLoading} />;
}

export function App(): React.JSX.Element {
  const { t } = useLanguage();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [initializeDialogRequest, setInitializeDialogRequest] = useState<{
    mode: InitializeTargetKind;
    existingPath?: string;
  } | null>(null);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useThemePreference();
  const effectiveTheme = resolveEffectiveTheme(theme);
  const themeToggleRef = useRef<HTMLButtonElement>(null);
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
    startThemeReveal(themeToggleRef.current, commitTheme(effectiveTheme === "dark" ? "light" : "dark"));
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
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const workingTreeCheckedAt = activeSession?.workingTreeCheckedAt ?? null;
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
  const [openErrorSecondaryAction, setOpenErrorSecondaryAction] = useState<{
    label: string;
    onAction: () => void;
  } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [publishDialogSessionId, setPublishDialogSessionId] = useState<string | null>(null);
  const [publishUpTo, setPublishUpTo] = useState<string | null>(null);
  const [saveDialogSessionId, setSaveDialogSessionId] = useState<string | null>(null);
  const [getTeamDialogSessionId, setGetTeamDialogSessionId] = useState<string | null>(null);
  // Overview's bounded quick-switch/quick-create: distinct from the
  // Version-lines feature screen's own dialog state because Overview isn't
  // that screen's React subtree. Both use the feature-owned dialogs and port.
  const [overviewSwitchTarget, setOverviewSwitchTarget] = useState<string | null>(null);
  const [overviewCreateRequest, setOverviewCreateRequest] = useState<{ forceSwitch: boolean } | null>(null);
  const [versionLinesAutoOpenCreate, setVersionLinesAutoOpenCreate] = useState(false);
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
    setOpenErrorSecondaryAction(null);
    setIsOpenErrorDialogOpen(true);
  };

  const startSessionOperation = (
    kind: "save" | "publish" | "discard" | "sync",
    upTo?: string,
  ): boolean => {
    const session = activeSession;
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

  const openPublishDialog = (upTo?: string): void => {
    startSessionOperation("publish", upTo);
  };
  const [skippedRestoreCount, setSkippedRestoreCount] = useState(0);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const gitTooling = useGitTooling(settingsPort);
  /* Read once after first paint and kept, like the Git diagnostics above.
     Owned here rather than inside the panel because the shell unmounts the
     panel on every close, which used to throw both answers away and pay for
     them again on the next opening. */
  const gitIdentity = useGitIdentity(settingsPort);
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
  const [diffPreferences, setDiffPreferences] = useStoredDiffPreferences();
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
  const [confirmDiscard, setConfirmDiscard] = useStoredBoolean(
    CONFIRM_DISCARD_STORAGE_KEY,
    CONFIRM_DISCARD_DEFAULT,
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
      setOpenErrorSecondaryAction(null);
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

  const checkWorkingTree = async (path: string, requestedEpoch?: string): Promise<void> => {
    const epoch = requestedEpoch ?? sessionsState.byId[path]?.epoch;
    if (epoch) await statusController.refresh(projectRuntime, { projectId: path, sessionEpoch: epoch }, mapStatusError);
  };

  const checkTeamChanges = async (path: string, sessionEpoch: string): Promise<void> => {
    const result = await syncController.check(
      projectRuntime,
      { projectId: path, sessionEpoch },
      mapSyncError,
    );
    // The explicit fetch mutates only shared remote-tracking metadata. Fan
    // that local invalidation through ordinary readers; no subscriber here
    // may contact the network.
    if (result?.knowledge === "fresh") {
      await repositoryReads.refreshAll(projectRuntime, projectRuntime.getSnapshot(), path);
    }
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
    let selectedPath: string | null = null;
    try {
      const selected = await openFolderDialog({ directory: true, multiple: false, title: t.overviewOpenDialogTitle });
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
      setOpenErrorSecondaryAction(
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
    }
    for (const { path, epoch } of plan.watch) {
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
    isShortcutsOpen ||
    isCloseConfirmOpen ||
    isOpenErrorDialogOpen ||
    isPaletteOpen;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
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
  const railDestinations = PROJECT_NAV_DESTINATIONS.map(toRailItem);

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
            onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
            onCloneProject={() => setIsCloneOpen(true)}
            onCloseProject={requestCloseActiveProject}
            onOpenSettings={() => openSettings()}
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
            ref={themeToggleRef}
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

      <main className="app-shell">
        {/* Read by `usePortalFlyout`: every menu the rail opens flies out from
            this panel's edge rather than from the button inside it. */}
        <aside className="sidebar" data-flyout-anchor="">
          <div className="brand-mark" aria-hidden="true">{CROCODILE_MARK}</div>

          <RailNav
            ariaLabel={t.navProjectAriaLabel}
            moreLabel={t.navMore}
            customizeLabel={t.navCustomizeNavigation}
            items={railDestinations}
            displayMode={navigationPreferences.displayMode}
            onCustomize={() => openSettings("navigation")}
          />

          {/* Slack-like hierarchy: project context follows the destinations,
              while account-level utilities stay anchored to the foot. The
              larger interval between groups does the separating without a
              decorative rule in an already narrow column. */}
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
                  // Round buttons this size carry no visible label, so their
                  // accessible name remains available without covering the
                  // rail with a pointer tooltip.
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
              disabled
              aria-label={t.navAccountTitle}
            >
              <UserRound aria-hidden="true" />
            </button>
          </nav>
        </aside>

        <section
          {...autoHideScrollbarProps<HTMLElement>()}
          className={`workspace auto-hide-scrollbar${view === "changes" ? " workspace--changes" : ""}${view === "history" ? " workspace--history" : ""}`}
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
                  onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
                  onCloneProject={() => setIsCloneOpen(true)}
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
                  teamSync={teamSync}
                  onCheckTeamChanges={() => {
                    if (activeSession) void checkTeamChanges(activeSession.id, activeSession.epoch);
                  }}
                  onReviewAndGetTeamChanges={() => startSessionOperation("sync")}
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
                          isWatching={watchProjects}
                          confirmBeforeDiscarding={confirmDiscard}
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
                    history: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <HistoryScreen
                          controller={historyController}
                          projectPath={project.path}
                          sessionEpoch={activeSession?.epoch ?? ""}
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
            onClose={() => {
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
            }}
            onPublished={(result) => {
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

      <AppOverlays
        settings={{
          isOpen: isSettingsOpen,
          setOpen: setIsSettingsOpen,
          theme,
          setTheme: changeTheme,
          section: settingsSection,
          setSection: setSettingsSection,
          gitTooling,
          reopenLastProject,
          setReopenLastProject,
          confirmCloseProject,
          setConfirmCloseProject,
          watchProjects,
          setWatchProjects,
          confirmDiscard,
          setConfirmDiscard,
          navigationItems: PROJECT_NAV_DESTINATIONS.map((destination) => ({
            id: destination.id,
            label: t[destination.labelKey],
            icon: destination.icon,
          })),
          navigationPreferences,
          setNavigationPreferences,
          diffPreferences,
          setDiffPreferences,
          defaults: {
            reopenLastProject: REOPEN_LAST_PROJECT_DEFAULT,
            confirmCloseProject: CONFIRM_CLOSE_PROJECT_DEFAULT,
            watchProjects: WATCH_PROJECTS_DEFAULT,
            confirmDiscard: CONFIRM_DISCARD_DEFAULT,
            navigationPreferences: DEFAULT_NAVIGATION_PREFERENCES,
          },
          identity: gitIdentity,
          lineEndings,
        }}
        about={{ isOpen: isAboutOpen, setOpen: setIsAboutOpen }}
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
          secondaryAction: openErrorSecondaryAction,
        }}
      />
      <TooltipHost />
    </div>
    </DiffPreferencesProvider>
  );
}
