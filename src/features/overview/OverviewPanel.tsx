import React, { Suspense, lazy, useEffect, useState } from "react";
import { Check, Copy, GitBranch, LoaderCircle, Pencil, Settings } from "lucide-react";

import { useLanguage } from "../../i18n";
import {
  ProjectAvatar,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  TECHNOLOGY_LABELS,
  type TechnologyId,
} from "../../shared/ui";
import { getRepositoryOverviewState, type RepositoryInfo } from "../repository";
import { getWorkingTreeBreakdown, type WorkingTreeStatus } from "../status";
import type { PendingVersionsResult } from "../publish";
import type { HistoryController } from "../history";
import {
  VersionLineQuickSwitch,
  type VersionLineCreateContext,
  type VersionLinesSnapshot,
} from "../version-lines";
import type { TeamSyncViewState } from "../sync";
import { ChangedFilesSection } from "./ChangedFilesSection";
import { deriveJourney } from "./journey";
import { JourneySection } from "./JourneySection";
import { OverviewPlaceholder } from "./OverviewPlaceholder";
import { HomeLauncher, type HomeRecentEntry } from "../home";

const HistorySummarySection = lazy(() =>
  import("./HistorySummarySection").then((m) => ({ default: m.HistorySummarySection })),
);
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

/** How the project shows itself everywhere else — the rail, the switcher, the
 * recents — so the header can wear the same icon. */
export type OverviewProjectIdentity = {
  iconChoice: ProjectIconChoice;
  technology: TechnologyId | null;
  avatarStyle: ProjectAvatarStyle;
};

/**
 * Who this screen is about, as a page header rather than a card: the name,
 * where it lives, the line you are on and its settings. It sits directly on
 * the workspace because it is the one thing on the screen that does not
 * change while you work — the cards below are for what does — and a card
 * around three facts was a card that was mostly air.
 *
 * Its tile is the project's own icon — the chosen emoji, the detected
 * technology or the initials — at the header's size, the same chip the rail
 * shows for it, so the project is recognised here the way it is recognised
 * there. Pressing it opens the icon section of project settings.
 */
function OverviewHeader({
  project,
  identity,
  overview,
  versionValue,
  versionLines,
  isLoadingVersionLines,
  favouriteVersionLines,
  onToggleFavouriteVersionLine,
  onQuickSwitchVersionLine,
  versionLineCreate,
  onGoToVersionLines,
  onCopyPathError,
  onOpenProjectSettings,
  onChangeProjectIcon,
  onPrefetchProjectSettings,
}: {
  project: RepositoryInfo;
  identity: OverviewProjectIdentity;
  overview: ReturnType<typeof getRepositoryOverviewState>;
  versionValue: string;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines: ReadonlySet<string>;
  onToggleFavouriteVersionLine: (name: string) => void;
  onQuickSwitchVersionLine: (target: string) => void;
  versionLineCreate?: VersionLineCreateContext;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
  /** The same panel the project switcher's gear opens, for the project this
   * header is already about. */
  onOpenProjectSettings: () => void;
  /** The same panel, opened at the project's icon. */
  onChangeProjectIcon: () => void;
  /** Warms that panel's first read on hover; see the switcher's own gear. */
  onPrefetchProjectSettings?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <header className="overview-header" aria-labelledby="project-summary-heading">
      <div className="overview-header__identity">
        <button
          className="overview-header__icon"
          type="button"
          aria-label={t.overviewChangeProjectIcon}
          data-tooltip={t.overviewChangeProjectIcon}
          onPointerEnter={() => onPrefetchProjectSettings?.()}
          onFocus={() => onPrefetchProjectSettings?.()}
          onClick={onChangeProjectIcon}
        >
          <ProjectAvatar
            id={project.path}
            name={project.name}
            className="overview-header__avatar"
            iconChoice={identity.iconChoice}
            technology={identity.technology}
            style={identity.avatarStyle}
          />
          <span className="overview-header__icon-edit" aria-hidden="true">
            <Pencil />
          </span>
        </button>
        <div className="overview-header__copy">
          <div className="overview-header__title">
            <h1 id="project-summary-heading" title={project.name}>{project.name}</h1>
            {/* The same gear the project switcher shows for the same panel,
                beside the name it configures. */}
            <button
              className="overview-header__settings"
              type="button"
              aria-label={t.projectSettingsOpenFor(project.name)}
              data-tooltip={t.projectSettingsOpen}
              onPointerEnter={() => onPrefetchProjectSettings?.()}
              onFocus={() => onPrefetchProjectSettings?.()}
              onClick={onOpenProjectSettings}
            >
              <Settings aria-hidden="true" />
            </button>
          </div>
          <div className="overview-header__subline">
            {/* First, so the path's copy control — invisible until the path
                is pointed at — never opens a gap between the two. */}
            {identity.technology && (
              <span className="overview-header__technology">{TECHNOLOGY_LABELS[identity.technology]}</span>
            )}
            <ProjectPath path={project.path} onCopyError={onCopyPathError} />
          </div>
        </div>
      </div>
      <div className="overview-header__actions">
        <div className="overview-meta" role="group" aria-label={t.overviewCurrentVersionLine}>
          {overview.isUnborn ? (
            <span className="overview-meta__branch-note">
              <GitBranch aria-hidden="true" className="overview-meta__branch-icon" />
              <span className="version-line-card__value">{versionValue}</span>
              {t[overview.versionDescriptionKey]}
            </span>
          ) : (
            <VersionLineQuickSwitch
              snapshot={versionLines}
              isLoadingSnapshot={isLoadingVersionLines}
              currentValue={versionValue}
              label={t.overviewVersionLineLabel}
              canSwitch={!overview.isDetached}
              favouriteLines={favouriteVersionLines}
              onToggleFavourite={onToggleFavouriteVersionLine}
              onSwitch={onQuickSwitchVersionLine}
              create={versionLineCreate}
              showCreateControl={false}
              onSeeAll={onGoToVersionLines}
            />
          )}
        </div>
      </div>
    </header>
  );
}

export function OverviewPanel({
  project,
  isOpening,
  isRestoring = false,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onCheckLocalChanges,
  onReviewChanges,
  onOpenProject,
  onCreateProject,
  onCloneProject,
  recentProjects,
  onOpenRecentProject,
  onToggleFavouriteRecentProject,
  onForgetRecentProject,
  canPublish,
  onPublish,
  onPublishUpTo,
  pendingVersions,
  pendingVersionsError,
  versionLines,
  isLoadingVersionLines,
  favouriteVersionLines,
  onToggleFavouriteVersionLine,
  onQuickSwitchVersionLine,
  versionLineCreate,
  onGoToVersionLines,
  onCopyPathError,
  onOpenSaveVersion,
  teamSync,
  onCheckTeamChanges,
  onReviewAndGetTeamChanges,
  historyController,
  onOpenHistory,
  onOpenProjectSettings,
  onChangeProjectIcon,
  onPrefetchProjectSettings,
  projectIdentity,
  selfEmail = null,
}: {
  project: RepositoryInfo | null;
  /** Only ever drives the *empty*-state's own loading affordance below —
   * opening another project while one is already active must not make the
   * active project's own card look like it's the one being (re)opened. Its
   * failures are reported in a standalone dialog (see `openError` in
   * `App`), never merged into this project's own status. */
  isOpening: boolean;
  /** Launch is still revalidating the projects it will reopen. Overview is
   * already the destination, so the launcher fallback below would flash Home
   * for the length of that check; the screen's own shape stands in instead. */
  isRestoring?: boolean;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Explicit local recovery. Healthy Overview data stays watcher-driven; this
   * action appears only beside a failed local snapshot. */
  onCheckLocalChanges: () => void;
  /** Opens the Changes screen. With a path, that file is selected first, so
   * the Overview preview is a shortcut *to a file*, not just to the screen. */
  onReviewChanges: (path?: string) => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  /** Projects opened before on this machine, already in display order
   * (favourites first, then by recency) — read from the app's own stores, not
   * from repository state, so the welcome screen never touches Git to draw
   * them. Empty until one has been opened. */
  recentProjects: readonly HomeRecentEntry[];
  onOpenRecentProject: (path: string) => void;
  /** Marks the *project*, not the row: the same favourites store the rail and
   * the switcher read, so the star survives closing and reopening the app. */
  onToggleFavouriteRecentProject: (path: string) => void;
  onForgetRecentProject: (path: string) => void;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  /** The project session's cached branch inventory, shared with the Version
   * lines screen so Overview's quick-switch menu opens instantly instead of
   * reading branches again every time (task 019). */
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines: ReadonlySet<string>;
  onToggleFavouriteVersionLine: (name: string) => void;
  canPublish: boolean;
  onPublish: () => void;
  onPublishUpTo: (commit: string) => void;
  onQuickSwitchVersionLine: (target: string) => void;
  /** Where the header's quick switch makes a new line, inside its popup. */
  versionLineCreate?: VersionLineCreateContext;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
  /** Opens this project's own settings — the remote it publishes to, the files
   * it ignores, and the identity it saves as. */
  onOpenProjectSettings: () => void;
  /** Opens the same panel at the project's icon, from the header's tile. */
  onChangeProjectIcon: () => void;
  /** Warms that panel's first read on hover, so opening it is not a wait. */
  onPrefetchProjectSettings?: () => void;
  /** The open project's icon, as the rail resolves it. */
  projectIdentity: OverviewProjectIdentity;
  /** The user's own Git email, so Recent history can say "You" for their
   * versions. `null` until it has been read, or when none is set. */
  selfEmail?: string | null;
  /** Opens the save-version flow. Overview has no file-selection UI of its
   * own to drive `SaveVersionDialog`'s exclusion checkboxes, so — like
   * `VersionLinesPanel` and `SwitchVersionLineDialog`'s own `onSaveVersion`
   * — this is expected to navigate to Changes and open the dialog there,
   * reusing its one existing implementation rather than a second copy of it. */
  onOpenSaveVersion: () => void;
  teamSync: TeamSyncViewState;
  onCheckTeamChanges: () => void;
  onReviewAndGetTeamChanges: () => void;
  /** The same project-scoped cache used by the full History screen. Overview
   * subscribes only while visible and never starts a second repository read. */
  historyController: HistoryController;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  if (project) {
    const overview = getRepositoryOverviewState(project);
    const versionValue = overview.isDetached
      ? t.overviewSpecificSavedVersion
      : (overview.versionLine ?? t.overviewNoSavedVersions);
    // The working tree is only unknown before the first check has finished, so
    // the band never invents a count and never blanks out a known one while a
    // later refresh is running.
    const breakdown = workingTree ? getWorkingTreeBreakdown(workingTree) : [];
    const journey = deriveJourney({
      workingTree,
      workingTreeError,
      isCheckingChanges,
      pendingVersionsCount: pendingVersions.totalCount,
      pendingVersionsError,
      teamSync,
    });
    const isRefreshing = isCheckingChanges || teamSync.isCheckingRemote;
    // Only a line with an upstream can be checked against one; the same gate
    // the status bar's own cloud button uses.
    const canCheckTeamChanges =
      project.headState === "branch" && Boolean(project.branch) && !teamSync.isCheckingRemote;

    return (
      <div className="project-overview" aria-busy={isRefreshing}>
        <OverviewHeader
          project={project}
          identity={projectIdentity}
          overview={overview}
          versionValue={versionValue}
          versionLines={versionLines}
          isLoadingVersionLines={isLoadingVersionLines}
          favouriteVersionLines={favouriteVersionLines}
          onToggleFavouriteVersionLine={onToggleFavouriteVersionLine}
          onQuickSwitchVersionLine={onQuickSwitchVersionLine}
          versionLineCreate={versionLineCreate}
          onGoToVersionLines={onGoToVersionLines}
          onCopyPathError={onCopyPathError}
          onOpenProjectSettings={onOpenProjectSettings}
          onChangeProjectIcon={onChangeProjectIcon}
          onPrefetchProjectSettings={onPrefetchProjectSettings}
        />

        <JourneySection
          journey={journey}
          breakdown={breakdown}
          canPublish={canPublish}
          onReviewChanges={() => onReviewChanges()}
          onCheckLocalChanges={onCheckLocalChanges}
          onSaveVersion={onOpenSaveVersion}
          onPublish={onPublish}
          onCheckTeamChanges={canCheckTeamChanges ? onCheckTeamChanges : () => undefined}
          onReviewAndGetTeamChanges={onReviewAndGetTeamChanges}
          onOpenProjectSettings={onOpenProjectSettings}
          onOpenHistory={onOpenHistory}
          historyController={historyController}
          projectPath={project.path}
          sessionEpoch={project.sessionEpoch}
        />

        {/* The two things that change while you work, side by side and the
            same height: which files, and which saved versions. With nothing
            to list the files card keeps that height and offers the next step. */}
        <div className="overview-columns">
          <ChangedFilesSection
            workingTree={workingTree}
            workingTreeError={workingTreeError}
            isCheckingChanges={isCheckingChanges}
            onOpenFile={(path) => onReviewChanges(path)}
            onSeeAll={() => onReviewChanges()}
            onCheckAgain={onCheckLocalChanges}
            headState={project.headState}
            onPublish={onPublish}
            onGetChanges={onReviewAndGetTeamChanges}
            onOpenHistory={onOpenHistory}
            onOpenSettings={onOpenProjectSettings}
          />

          <Suspense
            fallback={
              <section className="overview-history overview-history--loading" aria-label={t.overviewHistoryLoading}>
                <LoaderCircle aria-hidden="true" className="icon--spinning" />
              </section>
            }
          >
            <HistorySummarySection
              controller={historyController}
              projectPath={project.path}
              sessionEpoch={project.sessionEpoch}
              canPublish={canPublish}
              onOpenHistory={onOpenHistory}
              onPublishUpTo={onPublishUpTo}
              selfEmail={selfEmail}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  if (isRestoring) {
    return <OverviewPlaceholder />;
  }

  return (
    <HomeLauncher
      isOpening={isOpening}
      recentProjects={recentProjects}
      onOpenProject={onOpenProject}
      onCreateProject={onCreateProject}
      onCloneProject={onCloneProject}
      onOpenRecentProject={onOpenRecentProject}
      onToggleFavouriteRecentProject={onToggleFavouriteRecentProject}
      onForgetRecentProject={onForgetRecentProject}
      playGreeting={false}
    />
  );
}
