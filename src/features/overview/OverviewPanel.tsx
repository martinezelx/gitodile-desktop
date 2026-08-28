import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  ChevronRight,
  Copy,
  Eye,
  FileDiff,
  FileMinus,
  FilePlus,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  Pencil,
  Save,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { RefreshIconButton } from "../../shared/ui";
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

function ProjectSummaryCard({
  project,
  overview,
  versionValue,
  versionLines,
  isLoadingVersionLines,
  pendingVersionsCount,
  isRefreshing,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onRefresh,
  onCopyPathError,
}: {
  project: RepositoryInfo;
  overview: ReturnType<typeof getRepositoryOverviewState>;
  versionValue: string;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  pendingVersionsCount: number;
  isRefreshing: boolean;
  onQuickSwitchVersionLine: (target: string) => void;
  onQuickCreateVersionLine: (forceSwitch: boolean) => void;
  onGoToVersionLines: () => void;
  onRefresh: () => void;
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
        <RefreshIconButton
          className="project-summary-card__refresh"
          label={t.overviewRefresh}
          busyLabel={t.overviewRefreshing}
          busy={isRefreshing}
          onClick={onRefresh}
        />
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
  refreshActivity,
  onRefresh,
  onReviewChanges,
  onOpenProject,
  onCreateProject,
  onCloneProject,
  canPublish,
  onPublish,
  onPublishUpTo,
  pendingVersions,
  pendingVersionsError,
  versionLines,
  isLoadingVersionLines,
  onQuickSwitchVersionLine,
  onQuickCreateVersionLine,
  onGoToVersionLines,
  onCopyPathError,
  onOpenSaveVersion,
  teamSync,
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
  refreshActivity: { changes: boolean; team: boolean; history: boolean };
  /** Refreshes every Overview snapshot, including the explicit remote check.
   * The screen owns one refresh affordance; individual cards only keep actions
   * that operate on their content. */
  onRefresh: () => void;
  /** Opens the Changes screen. With a path, that file is selected first, so
   * the Overview preview is a shortcut *to a file*, not just to the screen. */
  onReviewChanges: (path?: string) => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
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
  teamSync: TeamSyncViewState;
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
    const isRefreshingChanges = isCheckingChanges || refreshActivity.changes;
    const isLoading = isRefreshingChanges && !workingTree;
    const isRefreshing = isRefreshingChanges || teamSync.isCheckingRemote ||
      refreshActivity.team || refreshActivity.history;
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
          pendingVersionsCount={pendingVersions.totalCount}
          isRefreshing={isRefreshing}
          onQuickSwitchVersionLine={onQuickSwitchVersionLine}
          onQuickCreateVersionLine={onQuickCreateVersionLine}
          onGoToVersionLines={onGoToVersionLines}
          onRefresh={onRefresh}
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
            isRefreshing={refreshActivity.team}
            canPublish={canPublish}
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
              isRefreshing={refreshActivity.history}
              onOpenHistory={onOpenHistory}
            />
          </Suspense>
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
        <button className="primary-button" type="button" onClick={onCreateProject} disabled={isOpening}>
          {t.overviewCreateLocalProject}
        </button>
        <button className="secondary-button" type="button" onClick={onOpenProject} disabled={isOpening}>
          {isOpening ? t.overviewOpening : t.overviewOpenProject}
        </button>
        <button className="secondary-button" type="button" onClick={onCloneProject} disabled={isOpening}>
          {t.overviewCloneRemoteProject}
        </button>
      </div>
    </div>
  );
}
