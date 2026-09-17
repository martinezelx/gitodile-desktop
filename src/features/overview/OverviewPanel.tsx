import React, { Suspense, lazy, useEffect, useId, useState } from "react";
import {
  Check,
  CloudDownload,
  Copy,
  FolderGit2,
  FolderInput,
  FolderPlus,
  GitBranch,
  LoaderCircle,
  Settings,
  Star,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import type { RecentProject } from "../../runtime/project/recentProjects";
import { avatarColorVar, avatarInitials } from "../../shared/ui";
import { getRepositoryOverviewState, type RepositoryInfo } from "../repository";
import { getWorkingTreeBreakdown, type WorkingTreeStatus } from "../status";
import type { PendingVersionsResult } from "../publish";
import type { HistoryController } from "../history";
import { VersionLineQuickSwitch, type VersionLinesSnapshot } from "../version-lines";
import type { TeamSyncViewState } from "../sync";
import { ChangedFilesSection } from "./ChangedFilesSection";
import { deriveJourney } from "./journey";
import { JourneySection } from "./JourneySection";

const PendingVersionsSection = lazy(() =>
  import("./PendingVersionsSection").then((m) => ({ default: m.PendingVersionsSection })),
);
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

/** A recent project plus whether it is one of the app's favourite projects —
 * the *same* favourites the rail and the project switcher show, from the same
 * store, so a project starred in either place is starred in both. Ordering is
 * done by the caller (`orderByFavourite`), which owns that rule for every list
 * that shows favourites. */
type WelcomeRecentEntry = RecentProject & { isFavourite: boolean };

/** How many recent projects the welcome screen lists. The store keeps more
 * (see `RECENT_PROJECTS_LIMIT`) so closing a project does not truncate the
 * tail; this is how many fit under the launcher before the front door starts
 * reading as a file manager. */
const WELCOME_RECENTS_VISIBLE = 5;

/** A project this machine has opened before. The name is the accessible name
 * and the path is its description, so a screen reader announces "gitodile,
 * C:\workspace\gitodile" rather than reading the path as part of the
 * label — and two projects that share a folder name are still told apart. */
function WelcomeRecentRow({
  index,
  entry,
  isDisabled,
  onOpen,
  onToggleFavourite,
  onForget,
}: {
  /** Position in the list, for the staggered arrival the Overview lists share. */
  index: number;
  entry: WelcomeRecentEntry;
  /** Gates opening only. Starring and forgetting a row touch nothing but this
   * machine's own lists, so an open already in flight is no reason to block
   * them. */
  isDisabled: boolean;
  onOpen: (path: string) => void;
  onToggleFavourite: (path: string) => void;
  onForget: (path: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameId = useId();
  const pathId = useId();

  return (
    <li className="welcome-recents__item row-in" style={{ "--row-index": index } as React.CSSProperties}>
      <button
        className="welcome-recents__open"
        type="button"
        disabled={isDisabled}
        aria-labelledby={nameId}
        aria-describedby={pathId}
        onClick={() => onOpen(entry.path)}
      >
        <span className="welcome-recents__avatar" aria-hidden="true" style={{ backgroundColor: avatarColorVar(entry.path) }}>
          {avatarInitials(entry.name)}
        </span>
        <span className="welcome-recents__copy">
          <span className="welcome-recents__name" id={nameId}>
            {entry.name}
          </span>
          <span className="welcome-recents__path" id={pathId} data-tooltip={entry.path}>
            {entry.path}
          </span>
        </span>
      </button>
      {/* Before Remove, so the destructive control stays last in reading and
          tab order — and rendered at rest rather than on hover, because a
          marked favourite has to be readable without pointing at it. Same
          reasoning, same shape and same strings as the switcher's own star:
          it is the same mark on the same project. */}
      <button
        className={`welcome-recents__favourite${entry.isFavourite ? " welcome-recents__favourite--on" : ""}`}
        type="button"
        aria-pressed={entry.isFavourite}
        aria-label={
          entry.isFavourite
            ? t.projectSwitcherUnfavourite(entry.name)
            : t.projectSwitcherFavourite(entry.name)
        }
        data-tooltip={
          entry.isFavourite ? t.projectSwitcherUnfavouriteHint : t.projectSwitcherFavouriteHint
        }
        onClick={() => onToggleFavourite(entry.path)}
      >
        <Star aria-hidden="true" />
      </button>
      <button
        className="welcome-recents__forget"
        type="button"
        aria-label={t.overviewForgetRecentProject(entry.name)}
        data-tooltip={t.overviewForgetRecentProjectShort}
        onClick={() => onForget(entry.path)}
      >
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The welcome screen's second half: what you already work on, under the three
 * ways to start something new. It exists because the front door's real
 * question is usually "let me back into the thing I had open", and the answer
 * used to be the folder picker every single time.
 *
 * Entries outlive their sessions on purpose — a closed project is exactly the
 * one worth offering — so a row can name a folder that has since moved. That
 * is reported by the open attempt through the normal failure path, and the row
 * can be dropped by hand; it is never silently removed here.
 *
 * With many projects the list is a wall, so its heading carries the same star
 * the quick switch's search box does: pressed, only favourites are listed. It
 * appears once there is a favourite to filter by — before that it would only
 * empty the list — and, like the switch's, it is a view and not a setting: it
 * resets with the screen.
 */
function WelcomeRecents({
  entries,
  isDisabled,
  onOpen,
  onToggleFavourite,
  onForget,
}: {
  entries: readonly WelcomeRecentEntry[];
  isDisabled: boolean;
  onOpen: (path: string) => void;
  onToggleFavourite: (path: string) => void;
  onForget: (path: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const headingId = useId();
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const hasFavourites = entries.some((entry) => entry.isFavourite);
  const shown = favouritesOnly && hasFavourites ? entries.filter((entry) => entry.isFavourite) : entries;

  return (
    <section className="welcome-recents" aria-labelledby={headingId}>
      <div className="welcome-recents__header">
        <h2 className="welcome-recents__title" id={headingId}>
          {t.overviewRecentProjectsTitle}
        </h2>
        {hasFavourites && (
          <button
            type="button"
            className={`welcome-recents__filter${favouritesOnly ? " welcome-recents__filter--on" : ""}`}
            aria-pressed={favouritesOnly}
            aria-label={favouritesOnly ? t.overviewRecentFavouritesOnlyOff : t.overviewRecentFavouritesOnly}
            data-tooltip={favouritesOnly ? t.overviewRecentFavouritesOnlyOff : t.overviewRecentFavouritesOnly}
            onClick={() => setFavouritesOnly((value) => !value)}
          >
            <Star aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="welcome-recents__list">
        {shown.slice(0, WELCOME_RECENTS_VISIBLE).map((entry, index) => (
          <WelcomeRecentRow
            key={entry.path}
            index={index}
            entry={entry}
            isDisabled={isDisabled}
            onOpen={onOpen}
            onToggleFavourite={onToggleFavourite}
            onForget={onForget}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One entry point on the welcome screen: a circular glyph tile with its label
 * and a one-line hint underneath. Three peer actions is one more than the
 * shared `.empty-state` pattern's "1–2 actions", and as capsules their labels
 * wrapped to three lines *inside* the pill — the card puts the text under the
 * icon instead, where wrapping is normal, and reuses the add-project menu's
 * own glyphs so the two routes to the same three flows look related.
 *
 * The three are peers and look it: no accent, no recommended one. Which of
 * them is right depends entirely on what the user already has on disk, and the
 * hint answers that better than a colour that only says "this one".
 *
 * The label carries the accessible name on its own (`aria-labelledby`) so the
 * hint stays a description rather than being read as part of the name.
 */
function WelcomeAction({
  icon,
  label,
  hint,
  isBusy = false,
  disabled,
  onClick,
}: {
  icon: React.JSX.Element;
  label: string;
  hint: string;
  isBusy?: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const labelId = useId();
  const hintId = useId();

  return (
    <button
      className="welcome-action"
      type="button"
      disabled={disabled}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      onClick={onClick}
    >
      <span className={`welcome-action__icon${isBusy ? " welcome-action__icon--loading" : ""}`} aria-hidden="true">
        {icon}
      </span>
      <span className="welcome-action__label" id={labelId}>
        {label}
      </span>
      <span className="welcome-action__hint" id={hintId}>
        {hint}
      </span>
    </button>
  );
}

/**
 * Who this screen is about, as a page header rather than a card: the name,
 * where it lives, the line you are on and its settings. It sits directly on
 * the workspace because it is the one thing on the screen that does not
 * change while you work — the cards below are for what does — and a card
 * around three facts was a card that was mostly air.
 */
function OverviewHeader({
  project,
  overview,
  versionValue,
  versionLines,
  isLoadingVersionLines,
  favouriteVersionLines,
  onToggleFavouriteVersionLine,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onCopyPathError,
  onOpenProjectSettings,
  onPrefetchProjectSettings,
}: {
  project: RepositoryInfo;
  overview: ReturnType<typeof getRepositoryOverviewState>;
  versionValue: string;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines: ReadonlySet<string>;
  onToggleFavouriteVersionLine: (name: string) => void;
  onQuickSwitchVersionLine: (target: string) => void;
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
  /** The same panel the project switcher's gear opens, for the project this
   * header is already about. */
  onOpenProjectSettings: () => void;
  /** Warms that panel's first read on hover; see the switcher's own gear. */
  onPrefetchProjectSettings?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <header className="overview-header" aria-labelledby="project-summary-heading">
      <div className="overview-header__identity">
        <span className="overview-header__glyph" aria-hidden="true">
          <FolderGit2 />
        </span>
        <div className="overview-header__copy">
          <h1 id="project-summary-heading" title={project.name}>{project.name}</h1>
          <ProjectPath path={project.path} onCopyError={onCopyPathError} />
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
              canSwitch={!overview.isDetached}
              favouriteLines={favouriteVersionLines}
              onToggleFavourite={onToggleFavouriteVersionLine}
              onSwitch={onQuickSwitchVersionLine}
              onCreate={() => onQuickCreateVersionLine(overview.isDetached)}
              showCreateControl={false}
              onSeeAll={onGoToVersionLines}
            />
          )}
        </div>
        {/* The same gear the project switcher shows for the same panel. */}
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
    </header>
  );
}

export function OverviewPanel({
  project,
  isOpening,
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
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onCopyPathError,
  onOpenSaveVersion,
  teamSync,
  onCheckTeamChanges,
  onReviewAndGetTeamChanges,
  historyController,
  onOpenHistory,
  onOpenProjectSettings,
  onPrefetchProjectSettings,
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
  recentProjects: readonly WelcomeRecentEntry[];
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
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
  /** Opens this project's own settings — the remote it publishes to, the files
   * it ignores, and the identity it saves as. */
  onOpenProjectSettings: () => void;
  /** Warms that panel's first read on hover, so opening it is not a wait. */
  onPrefetchProjectSettings?: () => void;
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
          overview={overview}
          versionValue={versionValue}
          versionLines={versionLines}
          isLoadingVersionLines={isLoadingVersionLines}
          favouriteVersionLines={favouriteVersionLines}
          onToggleFavouriteVersionLine={onToggleFavouriteVersionLine}
          onQuickSwitchVersionLine={onQuickSwitchVersionLine}
          onQuickCreateVersionLine={onQuickCreateVersionLine}
          onGoToVersionLines={onGoToVersionLines}
          onCopyPathError={onCopyPathError}
          onOpenProjectSettings={onOpenProjectSettings}
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
        />

        {/* The two things that change while you work, side by side and the
            same height: which files, and which saved versions. */}
        <div className="overview-columns">
          <ChangedFilesSection
            workingTree={workingTree}
            workingTreeError={workingTreeError}
            isCheckingChanges={isCheckingChanges}
            onOpenFile={(path) => onReviewChanges(path)}
            onSeeAll={() => onReviewChanges()}
            onCheckAgain={onCheckLocalChanges}
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
              onOpenHistory={onOpenHistory}
            />
          </Suspense>
        </div>

        {/* Work already saved but not yet published, with "publish up to
            here" per version. Only while there is something to publish: an
            empty card here would be the band's Publish tile said twice. */}
        {(pendingVersions.totalCount > 0 || pendingVersionsError) && (
          <section className="pending-versions-card">
            <Suspense fallback={null}>
              <PendingVersionsSection
                key={project.path}
                projectPath={project.path}
                sessionEpoch={project.sessionEpoch}
                result={pendingVersions}
                error={pendingVersionsError}
                onRetry={onCheckLocalChanges}
                onPublishUpTo={onPublishUpTo}
                canPublish={canPublish}
                onPublish={onPublish}
              />
            </Suspense>
          </section>
        )}
      </div>
    );
  }

  // The welcome screen owns the app's only `h1` while no project is open: the
  // shell drops its "Overview" topbar here, because naming the screen twice —
  // once as a heading nobody navigated to, once as this headline — spent the
  // front door's first line on the wrong sentence.
  return (
    <div className="empty-state empty-state--welcome" aria-busy={isOpening}>
      <h1>{t.overviewEmptyTitle}</h1>
      <p>{t.overviewEmptyDescription}</p>
      <div className="welcome-actions">
        <WelcomeAction
          icon={<FolderInput />}
          label={t.overviewCreateLocalProject}
          hint={t.overviewCreateLocalProjectHint}
          disabled={isOpening}
          onClick={onCreateProject}
        />
        <WelcomeAction
          // Opening is the only one of the three that runs here rather than in
          // a dialog, so its own card carries the progress instead of a
          // spinner at the top of a screen that is otherwise unchanged.
          icon={isOpening ? <LoaderCircle /> : <FolderPlus />}
          label={isOpening ? t.overviewOpening : t.overviewOpenProject}
          hint={t.overviewOpenProjectHint}
          isBusy={isOpening}
          disabled={isOpening}
          onClick={onOpenProject}
        />
        <WelcomeAction
          icon={<CloudDownload />}
          label={t.overviewCloneRemoteProject}
          hint={t.overviewCloneRemoteProjectHint}
          disabled={isOpening}
          onClick={onCloneProject}
        />
      </div>
      {/* The window has taken a dropped folder since task 093 and nothing said
          so — a gesture nobody is told about is a gesture nobody uses. It sits
          under the cards as one quiet line rather than as a fourth card,
          because it is another way to reach one of the three, not a fourth
          thing to do. */}
      <p className="welcome-drop-hint">{t.overviewDropFolderHint}</p>
      {recentProjects.length > 0 && (
        <WelcomeRecents
          entries={recentProjects}
          isDisabled={isOpening}
          onOpen={onOpenRecentProject}
          onToggleFavourite={onToggleFavouriteRecentProject}
          onForget={onForgetRecentProject}
        />
      )}
    </div>
  );
}
