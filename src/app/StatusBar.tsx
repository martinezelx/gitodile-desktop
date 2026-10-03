import React, { useEffect, useState } from "react";
import {
  CircleArrowUp,
  Cloud,
  CloudAlert,
  CloudCheck,
  FileDiff,
  FolderClosed,
  FolderGit2,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Settings,
  Sparkles,
} from "lucide-react";

import { useLanguage, type Language, type Translations } from "../i18n";
import { formatDate, formatRelativeCheckTime, type LocaleFormats } from "../shared/i18n";
import { appUpdateTranslations, type UpdateState } from "../features/app-updates";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type { TeamSyncState, TeamSyncViewState } from "../features/sync";
import {
  VersionLineQuickSwitch,
  type VersionLineCreateContext,
  type VersionLinesSnapshot,
} from "../features/version-lines";
import { CURRENT_APP_RELEASE } from "./appRelease";

const CLOCK_TICK_MS = 30_000;
const NO_FAVOURITE_VERSION_LINES: ReadonlySet<string> = new Set();

export type StatusBarProps = {
  project: Pick<RepositoryInfo, "name" | "branch" | "headState"> | null;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines?: ReadonlySet<string>;
  onToggleFavouriteVersionLine?: (name: string) => void;
  teamSync: TeamSyncViewState;
  onSwitchVersionLine: (target: string) => void;
  /** Where the quick switch makes a new line, inside its own popup. */
  versionLineCreate?: VersionLineCreateContext;
  onSeeAllVersionLines: () => void;
  onCheckTeamChanges: () => void;
  onOpenProjectSettings: () => void;
  onPrefetchProjectSettings?: () => void;
  /** Opens the publish dialog. Offered only when the cloud is ahead, so the
   * status bar's remote fact doubles as the shortcut to publishing it. */
  onPublish: () => void;
  onOpenChangelog: () => void;
  /** The updater's state. The release tag stays quiet while there is nothing
   * to do and becomes the way to the update when there is. */
  appUpdate?: UpdateState;
  /** From a confirmed update until the reader opens the changelog. */
  hasUnseenWhatsNew?: boolean;
  onOpenAppUpdate?: () => void;
};

function useStatusBarClock(): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

/** Re-exported for the tests that grew up beside it; it lives in shared i18n
 * now so Overview's band tells the same time. */
export { formatRelativeCheckTime };

function versionLineLabel(
  project: NonNullable<StatusBarProps["project"]>,
  t: Translations,
): string {
  if (project.headState === "detached") return t.statusBarDetached;
  if (project.branch) return project.branch;
  return project.headState === "unborn" ? t.statusBarUnbornLine : t.statusBarVersionLineUnavailable;
}

function workingTreeLabel(
  workingTree: WorkingTreeStatus | null,
  workingTreeError: string | null,
  isCheckingChanges: boolean,
  t: Translations,
): string {
  if (isCheckingChanges) return t.statusBarCheckingChanges;
  if (workingTreeError) return t.statusBarChangesUnavailable;
  if (!workingTree) return t.statusBarChangesNotChecked;
  return workingTree.isClean ? t.statusBarEverythingSaved : t.statusBarUnsaved(workingTree.counts.total);
}

function teamStateLabel(
  state: TeamSyncState,
  ahead: number,
  behind: number,
  t: Translations,
): string {
  switch (state) {
    case "upToDate": return t.statusBarUpToDate;
    case "ahead": return t.statusBarAhead(ahead);
    case "behind": return t.statusBarBehind(behind);
    case "diverged": return t.statusBarDiverged;
    case "noRemote": return t.statusBarNoRemote;
    case "noUpstream": return t.statusBarNoUpstream;
    case "unborn": return t.statusBarSyncUnborn;
    case "detached": return t.statusBarSyncDetached;
    case "unknown": return t.statusBarSyncUnknown;
  }
}

/** How the remote fact is known — from a check just now, from a saved
 * snapshot, or from a result that may since have gone stale — as one line for
 * the fact's tooltip, with the exact time after it when there is one. */
function teamFreshnessLabel(
  state: TeamSyncViewState,
  now: number,
  formats: LocaleFormats,
  t: Translations,
): string | null {
  const checkedAt = state.status?.checkedAt ?? state.lastSuccessfulCheckAt;
  const exactCheckedAt = checkedAt === null ? null : formatDate(new Date(checkedAt), formats, "date-time");
  let label: string | null = null;
  if (state.error) label = t.statusBarCheckFailed;
  else if (state.isStale) label = t.statusBarMayBeOutdated;
  else if (state.status?.knowledge === "cached") label = t.statusBarLocalSnapshot;
  else if (checkedAt !== null) {
    label = t.statusBarLastChecked(formatRelativeCheckTime(checkedAt, now, formats.language, t.statusBarJustNow));
  }
  if (label === null) return null;
  return exactCheckedAt ? `${label} · ${exactCheckedAt}` : label;
}

/** The tone the cloud takes: the good state green, anything the reader should
 * act on or doubt in the warning colour, and the rest in the strip's own. */
function teamTone(state: TeamSyncViewState): "success" | "warning" | "neutral" {
  if (state.isCheckingRemote || state.isLoading) return "neutral";
  if (state.error || state.isStale) return "warning";
  switch (state.status?.state) {
    case "upToDate": return "success";
    case "behind":
    case "diverged":
    case "noRemote":
    case "noUpstream":
    case "unknown": return "warning";
    default: return "neutral";
  }
}

/** The house mark beside the version: the mascot's back, three saved versions
 * along one line. It is drawn in the strip's ink, never a colour of its own,
 * so the tag gains a glyph like every other fact without adding a signal. */
function ReleaseMark({ busy = false }: { busy?: boolean }): React.JSX.Element {
  return (
    <svg
      className={`status-bar__release-mark${busy ? " status-bar__release-mark--busy" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 18.5C9 17 15 12 20 5" strokeWidth="1.8" />
      <circle cx="4.5" cy="18.3" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.2" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="19.3" cy="6" r="2.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

const RING_RADIUS = 9;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ fraction }: { fraction: number }): React.JSX.Element {
  return (
    <svg className="status-bar__release-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="status-bar__release-ring-track" cx="12" cy="12" r={RING_RADIUS} />
      <circle
        className="status-bar__release-ring-bar"
        cx="12"
        cy="12"
        r={RING_RADIUS}
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - Math.min(1, Math.max(0, fraction)))}
      />
    </svg>
  );
}

type ReleaseTag = {
  /** `action` wears the warning pill: a state the reader should act on. */
  variant: "quiet" | "action";
  mark: React.ReactNode;
  /** Replaces the version text; only an action names its state on the strip. */
  label: string | null;
  description: string;
  target: "changelog" | "update";
};

/** What the release tag says. At rest it is the version and the changelog; a
 * state to act on (a new version, one ready to install, one that can't install
 * yet) takes the tag over in the words About and the rail use, and leads to the
 * update dialog. A download in flight shows its progress without moving the
 * strip. The notification centre announces an update once; this is where it
 * stays until it is resolved, with no count of its own. */
function releaseTag(
  update: UpdateState | undefined,
  hasUnseenWhatsNew: boolean,
  language: Language,
  t: Translations,
): ReleaseTag {
  const version = CURRENT_APP_RELEASE.version;
  const changelog = t.statusBarOpenChangelog(version);
  const ut = appUpdateTranslations(language);
  switch (update?.kind) {
    case "available": {
      const label = ut.available(update.candidate.version);
      return {
        variant: "action",
        mark: <CircleArrowUp aria-hidden="true" />,
        label,
        description: `${label} · ${t.statusBarOpenUpdates}`,
        target: "update",
      };
    }
    case "ready":
      return {
        variant: "action",
        mark: <RotateCcw aria-hidden="true" />,
        label: ut.ready,
        description: `${ut.ready} · ${ut.available(update.candidate.version)}`,
        target: "update",
      };
    case "blocked":
      return {
        variant: "action",
        mark: <CircleArrowUp aria-hidden="true" />,
        label: ut.status.blocked,
        description: `${ut.status.blocked} · ${t.statusBarOpenUpdates}`,
        target: "update",
      };
    case "downloading": {
      const { transfer } = update;
      const fraction = transfer.length === "known" && transfer.totalBytes > 0
        ? Math.min(1, transfer.receivedBytes / transfer.totalBytes)
        : null;
      const title = ut.titleDownloading(update.candidate.version);
      return {
        variant: "quiet",
        mark: fraction === null
          ? <LoaderCircle className="icon--spinning" aria-hidden="true" />
          : <ProgressRing fraction={fraction} />,
        label: null,
        description: fraction === null ? title : `${title} · ${Math.floor(fraction * 100)}%`,
        target: "update",
      };
    }
    case "verifying":
      return { variant: "quiet", mark: <ProgressRing fraction={1} />, label: null, description: ut.verifying, target: "update" };
    case "checking":
      return { variant: "quiet", mark: <ReleaseMark busy />, label: null, description: `${changelog} · ${ut.checking}`, target: "changelog" };
    case "unavailable":
      // A lasting fact of this build (a development build, an installation
      // the updater can't write to), so it never dims the tag as if broken.
      return { variant: "quiet", mark: <ReleaseMark />, label: null, description: `${changelog} · ${t.aboutUpdateUnavailable}`, target: "changelog" };
    default:
      // Only once an update is settled: the version just installed has notes
      // the reader has not opened yet, and the accent sparkle says so.
      if (hasUnseenWhatsNew) {
        return {
          variant: "quiet",
          mark: <Sparkles className="status-bar__release-new" aria-hidden="true" />,
          label: null,
          description: `${ut.startupConfirmed(version)} · ${ut.seeWhatsNew}`,
          target: "changelog",
        };
      }
      return { variant: "quiet", mark: <ReleaseMark />, label: null, description: changelog, target: "changelog" };
  }
}

export function StatusBar({
  project,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  versionLines,
  isLoadingVersionLines,
  favouriteVersionLines = NO_FAVOURITE_VERSION_LINES,
  onToggleFavouriteVersionLine,
  teamSync,
  onSwitchVersionLine,
  versionLineCreate,
  onSeeAllVersionLines,
  onCheckTeamChanges,
  onOpenProjectSettings,
  onPrefetchProjectSettings,
  onPublish,
  onOpenChangelog,
  appUpdate,
  hasUnseenWhatsNew = false,
  onOpenAppUpdate,
}: StatusBarProps): React.JSX.Element {
  const { t, formats, language } = useLanguage();
  const release = releaseTag(appUpdate, hasUnseenWhatsNew, language, t);
  const releaseText = release.label ?? t.statusBarVersion(CURRENT_APP_RELEASE.version);
  // The accessible name keeps the visible words, so "click 0.3.1" still
  // finds the button while the tooltip talks about a download.
  const releaseName = release.description.includes(releaseText)
    ? release.description
    : `${releaseText} · ${release.description}`;
  const openRelease = release.target === "update" && onOpenAppUpdate ? onOpenAppUpdate : onOpenChangelog;
  const now = useStatusBarClock();
  const isReadingTeamStatus = teamSync.isLoading && !teamSync.status;
  const teamLabel = teamSync.isCheckingRemote
    ? t.statusBarCheckingTeam
    : isReadingTeamStatus
      ? t.statusBarReadingTeam
      : teamSync.error && !teamSync.status
        ? t.statusBarTeamUnavailable
        : teamSync.status
          ? teamStateLabel(teamSync.status.state, teamSync.status.ahead, teamSync.status.behind, t)
          : t.statusBarTeamNotChecked;
  const freshness = teamFreshnessLabel(teamSync, now, formats, t);
  const tone = teamTone(teamSync);
  // A stale or failed result still shows the last known state, but the strip
  // must not read as current: the doubt becomes the word, the state the tooltip.
  const visibleTeamLabel = !teamSync.isCheckingRemote && !isReadingTeamStatus && teamSync.status && (teamSync.error || teamSync.isStale)
    ? (teamSync.error ? t.statusBarCheckFailed : t.statusBarMayBeOutdated)
    : teamLabel;
  const teamTooltip = [teamLabel !== visibleTeamLabel ? teamLabel : null, freshness].filter(Boolean).join(" · ");
  // The cloud becomes the shortcut to publishing when there are saved versions
  // to send and the relation is known and current. A stale, failed or
  // still-loading answer keeps it a plain fact: it is not a state to act from.
  const publishableCount =
    !teamSync.isCheckingRemote && !isReadingTeamStatus && !teamSync.error && !teamSync.isStale &&
    teamSync.status?.state === "ahead"
      ? teamSync.status.ahead
      : 0;
  const publishAction = publishableCount > 0 ? t.statusBarPublishAction(publishableCount) : null;
  const publishTooltip = publishAction ? [publishAction, freshness].filter(Boolean).join(" · ") : null;
  const changesLabel = workingTreeLabel(workingTree, workingTreeError, isCheckingChanges, t);
  const changesCount = workingTree && !isCheckingChanges && !workingTreeError ? workingTree.counts.total : 0;
  // The line totals ride beside the count as a quieter second fact: the count
  // is how many files, these are how much. They are drawn only when the
  // backend could count the whole tree and at least one line moved — `null` is
  // "unknown", never "zero", and "+0 −0" would be noise.
  const lineTotals = workingTree && !isCheckingChanges && !workingTreeError ? workingTree.lineTotals : null;
  const hasLineTotals = lineTotals !== null && (lineTotals.added > 0 || lineTotals.removed > 0);
  const lineTotalsLabel = lineTotals && hasLineTotals
    ? [
        lineTotals.added > 0 ? t.statusBarLinesAdded(lineTotals.added) : null,
        lineTotals.removed > 0 ? t.statusBarLinesRemoved(lineTotals.removed) : null,
      ].filter((part): part is string => part !== null).join(", ")
    : null;
  const changesTooltip = lineTotalsLabel ? `${changesLabel} · ${lineTotalsLabel}` : changesLabel;
  const canCheckTeam = Boolean(
    project?.headState === "branch" &&
    project.branch &&
    !teamSync.isCheckingRemote &&
    !isReadingTeamStatus,
  );
  const isBusy = Boolean(project && (isCheckingChanges || teamSync.isLoading || teamSync.isCheckingRemote));
  const syncIcon = teamSync.isCheckingRemote || isReadingTeamStatus
    ? <LoaderCircle className="icon--spinning" aria-hidden="true" />
    : tone === "success"
      ? <CloudCheck aria-hidden="true" />
      : tone === "warning"
        ? <CloudAlert aria-hidden="true" />
        : <Cloud aria-hidden="true" />;

  return (
    <footer className="status-bar" aria-label={t.statusBarAriaLabel} aria-busy={isBusy}>
      {project ? (
        <div className="status-bar__group status-bar__group--project">
          {/* The one persistent statement of what is being worked on — which
              project, and which line of it — and the one global way to change
              the line. The two facts are the sentence; the project's name is
              what makes the strip still say something after leaving Overview.
              No screen adds a second selector to its own header: two controls
              answering the same question in one window is how the reader
              stops trusting either. */}
          <span className="status-bar__cluster status-bar__working">
            <span className="status-bar__item status-bar__project" data-tooltip={t.statusBarProjectTooltip(project.name)}>
              <FolderGit2 aria-hidden="true" />
              <span>{project.name}</span>
            </span>
            <button
              className="status-bar__action status-bar__project-settings"
              type="button"
              aria-label={t.projectSettingsOpenFor(project.name)}
              data-tooltip={t.projectSettingsOpen}
              onPointerEnter={onPrefetchProjectSettings}
              onFocus={onPrefetchProjectSettings}
              onClick={onOpenProjectSettings}
            >
              <Settings aria-hidden="true" />
            </button>
            <VersionLineQuickSwitch
              snapshot={versionLines}
              isLoadingSnapshot={isLoadingVersionLines}
              currentValue={versionLineLabel(project, t)}
              canSwitch={project.headState === "branch" && Boolean(project.branch)}
              variant="status"
              favouriteLines={favouriteVersionLines}
              onToggleFavourite={onToggleFavouriteVersionLine}
              onSwitch={onSwitchVersionLine}
              create={versionLineCreate}
              onSeeAll={onSeeAllVersionLines}
            />
          </span>
          <span
            className={`status-bar__item status-bar__changes${workingTreeError && !isCheckingChanges ? " status-bar__changes--error" : ""}`}
            data-tooltip={changesTooltip}
          >
            {/* The icon and its corner badge share one positioned box so the
                badge rides the icon, not the line totals now sitting beside
                it. */}
            <span className="status-bar__changes-mark" aria-hidden="true">
              {isCheckingChanges ? <LoaderCircle className="icon--spinning" /> : <FileDiff />}
              {changesCount > 0 && (
                <span className="status-bar__changes-count">
                  {changesCount > 99 ? "99+" : changesCount}
                </span>
              )}
            </span>
            {lineTotals && hasLineTotals && (
              <span className="status-bar__diff-stats" aria-hidden="true">
                <span className="status-bar__diff-stat status-bar__diff-stat--added">
                  {`+${lineTotals.added}`}
                </span>
                <span className="status-bar__diff-stat status-bar__diff-stat--removed">
                  {`−${lineTotals.removed}`}
                </span>
              </span>
            )}
            <span className="visually-hidden">{changesTooltip}</span>
          </span>
        </div>
      ) : (
        <div className="status-bar__group status-bar__group--project">
          <span className="status-bar__item status-bar__item--muted">
            <FolderClosed aria-hidden="true" />
            <span>{t.statusBarNoProject}</span>
          </span>
        </div>
      )}

      <div className="status-bar__group status-bar__group--system">
        {project && (
          <span className="status-bar__cluster" aria-live="polite">
            {publishAction ? (
              <button
                className={`status-bar__item status-bar__sync status-bar__sync--${tone} status-bar__sync-action`}
                type="button"
                onClick={onPublish}
                aria-label={publishAction}
                data-tooltip={publishTooltip ?? undefined}
              >
                {syncIcon}
                <span>{visibleTeamLabel}</span>
              </button>
            ) : (
              <span
                className={`status-bar__item status-bar__sync status-bar__sync--${tone}`}
                data-tooltip={teamTooltip || undefined}
              >
                {syncIcon}
                <span>{visibleTeamLabel}</span>
                {teamTooltip && <span className="visually-hidden"> · {teamTooltip}</span>}
              </span>
            )}
            <button
              className="status-bar__action"
              type="button"
              disabled={!canCheckTeam}
              onClick={onCheckTeamChanges}
              aria-label={teamSync.isCheckingRemote ? t.statusBarCheckingTeam : t.statusBarCheckNow}
              data-tooltip={teamSync.isCheckingRemote ? t.statusBarCheckingTeam : t.statusBarCheckNow}
            >
              <RotateCw className={teamSync.isCheckingRemote ? "icon--spinning" : undefined} aria-hidden="true" />
            </button>
          </span>
        )}
        <button
          className={`status-bar__release status-bar__release--${release.variant}`}
          type="button"
          onClick={openRelease}
          aria-label={releaseName}
          data-tooltip={release.description}
        >
          {release.mark}
          <span className="status-bar__version">{releaseText}</span>
        </button>
      </div>
    </footer>
  );
}
