import React, { Suspense, lazy, useEffect, useId, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  CloudDownload,
  Copy,
  Eye,
  FileDiff,
  FileMinus,
  FilePlus,
  FolderInput,
  FolderPlus,
  GitBranch,
  LoaderCircle,
  Pencil,
  Save,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import type { RecentProject } from "../../runtime/project/recentProjects";
import { avatarColorVar, avatarInitials } from "../../shared/ui";
import { getRepositoryOverviewState, type RepositoryInfo } from "../repository";
import {
  CATEGORY_ORDER,
  getOrderedChangeEntries,
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  splitPath,
  type ChangeCategory,
  type WorkingTreeStatus,
} from "../status";
import type { PendingVersionsResult } from "../publish";
import type { HistoryController } from "../history";
import { VersionLineQuickSwitch, type VersionLinesSnapshot } from "../version-lines";
import { TeamChangesSection, type TeamSyncViewState } from "../sync";

const PendingVersionsSection = lazy(() =>
  import("./PendingVersionsSection").then((m) => ({ default: m.PendingVersionsSection })),
);
const HistorySummarySection = lazy(() =>
  import("./HistorySummarySection").then((m) => ({ default: m.HistorySummarySection })),
);
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
  const { getFileTypeIcon } = await import("../../shared/file-icons");
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
 * and the path is its description, so a screen reader announces "gitodrile,
 * C:\workspace\gitodrile" rather than reading the path as part of the
 * label — and two projects that share a folder name are still told apart. */
function WelcomeRecentRow({
  entry,
  isDisabled,
  onOpen,
  onToggleFavourite,
  onForget,
}: {
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
    <li className="welcome-recents__item">
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

  return (
    <section className="welcome-recents" aria-labelledby={headingId}>
      <h2 className="welcome-recents__title" id={headingId}>
        {t.overviewRecentProjectsTitle}
      </h2>
      <ul className="welcome-recents__list">
        {entries.slice(0, WELCOME_RECENTS_VISIBLE).map((entry) => (
          <WelcomeRecentRow
            key={entry.path}
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

function ProjectSummaryCard({
  project,
  overview,
  versionValue,
  versionLines,
  isLoadingVersionLines,
  favouriteVersionLines,
  onToggleFavouriteVersionLine,
  pendingVersionsCount,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onCopyPathError,
}: {
  project: RepositoryInfo;
  overview: ReturnType<typeof getRepositoryOverviewState>;
  versionValue: string;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines: ReadonlySet<string>;
  onToggleFavouriteVersionLine: (name: string) => void;
  pendingVersionsCount: number;
  onQuickSwitchVersionLine: (target: string) => void;
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
  onCopyPathError: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <section className="project-summary-card" aria-labelledby="project-summary-heading">
      <div className="project-summary-card__identity">
        <h1 id="project-summary-heading">{project.name}</h1>
        <ProjectPath path={project.path} onCopyError={onCopyPathError} />
        {overview.wasOpenedFromNestedFolder && (
          <p className="project-overview__nested">
            {t.overviewOpenedFrom}
            <span data-tooltip={project.selectedPath}>{project.selectedPath}</span>
          </p>
        )}
      </div>
      <div className="project-summary-card__actions">
        <div className="overview-meta" role="group" aria-label={t.overviewCurrentVersionLine}>
          <span className="overview-meta__branch">
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
                onSeeAll={onGoToVersionLines}
              />
            )}
          </span>
          {pendingVersionsCount > 0 && (
            <span className="overview-meta__stat overview-meta__stat--accent">
              {t.overviewVersionsAhead(pendingVersionsCount)}
            </span>
          )}
        </div>
      </div>
    </section>
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
    // the card never invents a count and never blanks out a known one while a
    // later refresh is running.
    const summary = workingTree ? getWorkingTreeSummary(workingTree) : null;
    const breakdown = workingTree ? getWorkingTreeBreakdown(workingTree) : [];
    const isRefreshingChanges = isCheckingChanges;
    const isLoading = isRefreshingChanges && !workingTree;
    const isRefreshing = isRefreshingChanges || teamSync.isCheckingRemote;
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
      <div className="project-overview" aria-busy={isRefreshing}>
        <ProjectSummaryCard
          project={project}
          overview={overview}
          versionValue={versionValue}
          versionLines={versionLines}
          isLoadingVersionLines={isLoadingVersionLines}
          favouriteVersionLines={favouriteVersionLines}
          onToggleFavouriteVersionLine={onToggleFavouriteVersionLine}
          pendingVersionsCount={pendingVersions.totalCount}
          onQuickSwitchVersionLine={onQuickSwitchVersionLine}
          onQuickCreateVersionLine={onQuickCreateVersionLine}
          onGoToVersionLines={onGoToVersionLines}
          onCopyPathError={onCopyPathError}
        />

        <section
          className={`project-hero project-hero--${heroStatus}`}
          aria-labelledby="project-hero-heading"
        >
          <div className="project-hero__icon" aria-hidden="true">
            {isRefreshingChanges ? (
              <LoaderCircle className="icon--spinning" />
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
            <div className="project-hero__buttons">
              {workingTreeError && !isCheckingChanges && (
                <button
                  className="secondary-button project-hero__action"
                  type="button"
                  onClick={onCheckLocalChanges}
                >
                  {t.overviewCheckLocalAgain}
                </button>
              )}
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
                sessionEpoch={project.sessionEpoch}
                result={pendingVersions}
                error={pendingVersionsError}
                onRetry={onCheckLocalChanges}
                onPublishUpTo={onPublishUpTo}
                canPublish={canPublish}
                onPublish={onPublish}
              />
            </Suspense>
          )}
          <StatusAnnouncement isBusy={isRefreshingChanges} message={`${heroHeadline}. ${heroMessage}`} />
        </section>

        <div className="overview-support-grid">
          <TeamChangesSection
            state={teamSync}
            canPublish={canPublish}
            onCheck={onCheckTeamChanges}
            onPublish={onPublish}
            onReviewAndGet={onReviewAndGetTeamChanges}
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
