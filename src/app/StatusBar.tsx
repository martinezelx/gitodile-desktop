import React, { useEffect, useState } from "react";
import {
  Cloud,
  FileDiff,
  FolderClosed,
  LoaderCircle,
  RotateCw,
} from "lucide-react";

import { useLanguage, type Translations } from "../i18n";
import { formatDate, type LocaleFormats } from "../shared/i18n";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type { TeamSyncState, TeamSyncViewState } from "../features/sync";
import { VersionLineQuickSwitch, type VersionLinesSnapshot } from "../features/version-lines";
import { CURRENT_APP_RELEASE } from "./appRelease";

const CLOCK_TICK_MS = 30_000;
const NO_FAVOURITE_VERSION_LINES: ReadonlySet<string> = new Set();

export type StatusBarProps = {
  project: Pick<RepositoryInfo, "branch" | "headState"> | null;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  versionLines: VersionLinesSnapshot | null;
  isLoadingVersionLines: boolean;
  favouriteVersionLines?: ReadonlySet<string>;
  onToggleFavouriteVersionLine?: (name: string) => void;
  teamSync: TeamSyncViewState;
  onSwitchVersionLine: (target: string) => void;
  onSeeAllVersionLines: () => void;
  onCheckTeamChanges: () => void;
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

export function formatRelativeCheckTime(
  checkedAt: number,
  now: number,
  /* A BCP-47 tag rather than the app's own `Language`: a relative time has no
     separators for the date-format preference to choose between, so it follows
     the locale directly, and `LocaleFormats` carries that as a plain tag. */
  language: string,
  justNow: string,
): string {
  const elapsed = Math.max(0, now - checkedAt);
  if (elapsed < 45_000) return justNow;

  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "always", style: "short" });
  if (elapsed < 60 * 60_000) {
    return formatter.format(-Math.round(elapsed / 60_000), "minute");
  }
  if (elapsed < 24 * 60 * 60_000) {
    return formatter.format(-Math.round(elapsed / (60 * 60_000)), "hour");
  }
  return formatter.format(-Math.round(elapsed / (24 * 60 * 60_000)), "day");
}

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

function teamFreshnessLabel(
  state: TeamSyncViewState,
  now: number,
  formats: LocaleFormats,
  t: Translations,
): { label: string; exactCheckedAt: string | undefined } | null {
  const checkedAt = state.status?.checkedAt ?? state.lastSuccessfulCheckAt;
  const exactCheckedAt = checkedAt === null
    ? undefined
    : formatDate(new Date(checkedAt), formats, "date-time");

  if (state.error) return { label: t.statusBarCheckFailed, exactCheckedAt };
  if (state.isStale) return { label: t.statusBarMayBeOutdated, exactCheckedAt };
  if (state.status?.knowledge === "cached") return { label: t.statusBarLocalSnapshot, exactCheckedAt };
  if (checkedAt !== null) {
    const relative = formatRelativeCheckTime(checkedAt, now, formats.language, t.statusBarJustNow);
    return { label: t.statusBarLastChecked(relative), exactCheckedAt };
  }
  return null;
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
  onSeeAllVersionLines,
  onCheckTeamChanges,
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
  const canCheckTeam = Boolean(
    project?.headState === "branch" &&
    project.branch &&
    !teamSync.isCheckingRemote &&
    !isReadingTeamStatus,
  );
  const isBusy = isCheckingChanges || teamSync.isLoading || teamSync.isCheckingRemote;

  return (
    <footer className="status-bar" aria-label={t.statusBarAriaLabel} aria-busy={isBusy}>
      {project ? (
        <div className="status-bar__group status-bar__group--project">
          <VersionLineQuickSwitch
            snapshot={versionLines}
            isLoadingSnapshot={isLoadingVersionLines}
            currentValue={versionLineLabel(project, t)}
            canSwitch={project.headState === "branch" && Boolean(project.branch)}
            variant="status"
            favouriteLines={favouriteVersionLines}
            onToggleFavourite={onToggleFavouriteVersionLine}
            onSwitch={onSwitchVersionLine}
            onSeeAll={onSeeAllVersionLines}
          />
          <span className="status-bar__item">
            {isCheckingChanges ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <FileDiff aria-hidden="true" />}
            <span>{workingTreeLabel(workingTree, workingTreeError, isCheckingChanges, t)}</span>
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
            <span className="status-bar__item status-bar__sync">
              {teamSync.isCheckingRemote || isReadingTeamStatus
                ? <LoaderCircle className="icon--spinning" aria-hidden="true" />
                : <Cloud aria-hidden="true" />}
              <span>{teamLabel}</span>
            </span>
            {freshness && (
              <span className="status-bar__item status-bar__item--muted" title={freshness.exactCheckedAt}>
                {freshness.label}
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
            <span className="status-bar__channel" aria-hidden="true">preview</span>
          )}
        </button>
      </div>
    </footer>
  );
}
