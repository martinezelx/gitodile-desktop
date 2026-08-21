import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileDiff,
  FileMinus,
  FilePlus,
  FolderOpen,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  LifeBuoy,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Save,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
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
import type { VersionLine, VersionLinesSnapshot } from "../version-lines";
import { TeamChangesSection, type TeamSyncViewState } from "../sync";

const PendingVersionsSection = lazy(() =>
  import("./PendingVersionsSection").then((m) => ({ default: m.PendingVersionsSection })),
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
  const { getFileTypeIcon } = await import("../../fileIcons");
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

export function OverviewPanel({
  project,
  isOpening,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onCheckChanges,
  onReviewChanges,
  onOpenProject,
  onCloneProject,
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
  teamSync,
  onCheckTeamChanges,
  onReviewAndGetTeamChanges,
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
  onCloneProject: () => void;
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
  teamSync: TeamSyncViewState;
  onCheckTeamChanges: () => void;
  onReviewAndGetTeamChanges: () => void;
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
                sessionEpoch={project.sessionEpoch}
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

        <TeamChangesSection
          state={teamSync}
          canPublish={canPublish}
          onCheck={onCheckTeamChanges}
          onPublish={onPublish}
          onReviewAndGet={onReviewAndGetTeamChanges}
        />

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
        <button className="secondary-button" type="button" onClick={onCloneProject} disabled={isOpening}>
          {t.overviewCloneRemoteProject}
        </button>
      </div>
    </div>
  );
}
