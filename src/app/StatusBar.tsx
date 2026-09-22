import React, { useEffect, useState } from "react";
import {
  Cloud,
  CloudAlert,
  CloudCheck,
  FileDiff,
  FolderClosed,
  FolderGit2,
  LoaderCircle,
  RotateCw,
  Settings,
} from "lucide-react";

import { useLanguage, type Translations } from "../i18n";
import { formatDate, formatRelativeCheckTime, type LocaleFormats } from "../shared/i18n";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type { TeamSyncState, TeamSyncViewState } from "../features/sync";
import { VersionLineQuickSwitch, type VersionLinesSnapshot } from "../features/version-lines";
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
  onCreateVersionLine: () => void;
  onSeeAllVersionLines: () => void;
  onCheckTeamChanges: () => void;
  onOpenProjectSettings: () => void;
  onPrefetchProjectSettings?: () => void;
  /** Opens the publish dialog. Offered only when the cloud is ahead, so the
   * status bar's remote fact doubles as the shortcut to publishing it. */
  onPublish: () => void;
  onOpenChangelog: () => void;
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
  onCreateVersionLine,
  onSeeAllVersionLines,
  onCheckTeamChanges,
  onOpenProjectSettings,
  onPrefetchProjectSettings,
  onPublish,
  onOpenChangelog,
}: StatusBarProps): React.JSX.Element {
  const { t, formats } = useLanguage();
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
  const isBusy = isCheckingChanges || teamSync.isLoading || teamSync.isCheckingRemote;
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
              onCreate={onCreateVersionLine}
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
          className="status-bar__release status-bar__item--muted"
          type="button"
          onClick={onOpenChangelog}
          aria-label={t.statusBarOpenChangelog(CURRENT_APP_RELEASE.version, CURRENT_APP_RELEASE.channel)}
          data-tooltip={t.statusBarOpenChangelog(CURRENT_APP_RELEASE.version, CURRENT_APP_RELEASE.channel)}
        >
          <span className="status-bar__version">{t.statusBarVersion(CURRENT_APP_RELEASE.version)}</span>
          {CURRENT_APP_RELEASE.channel === "preview" && (
            <span className="channel-badge channel-badge--preview" aria-hidden="true">preview</span>
          )}
        </button>
      </div>
    </footer>
  );
}
