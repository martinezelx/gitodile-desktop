import React, { useMemo } from "react";
import {
  ChevronRight,
  CircleAlert,
  GitCommitHorizontal,
  CloudUpload,
  LoaderCircle,
  Monitor,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { LoadingPlaceholder, TextPlaceholder } from "../../shared/ui";
import {
  decorationLabel,
  formatHistoryDate,
  HistoryMetaDot,
  HistoryRefBadge,
  isSelfAuthor,
  primaryDecoration,
  useActiveHistoryState,
  type HistoryController,
  type SavedVersionSummary,
} from "../history";

const HISTORY_PREVIEW_LIMIT = 4;

function versionTitle(version: SavedVersionSummary, fallback: string): string {
  return version.subject.trim() || fallback;
}

/** Subject and author/date lengths for the first read's rows, one per
 * previewed version (`HISTORY_PREVIEW_LIMIT`). */
const HISTORY_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["62%", "34%"],
  ["48%", "28%"],
  ["70%", "38%"],
  ["54%", "30%"],
];

export function HistorySummarySection({
  controller,
  projectPath,
  sessionEpoch,
  isRefreshing = false,
  canPublish = false,
  onOpenHistory,
  onPublishUpTo,
  selfEmail = null,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  isRefreshing?: boolean;
  /** Whether a version that is still only on this computer may be offered
   * "publish up to here" — the same gate as the band's Publish tile. */
  canPublish?: boolean;
  onOpenHistory: () => void;
  /** Publishes this version and every older one under it, through the
   * previewed publish flow. Only offered on rows the inventory says are not
   * yet published, and only when `canPublish`. */
  onPublishUpTo?: (commit: string) => void;
  /** The user's own Git email: their versions say "You" rather than their
   * full name, which was the first thing the row's meta cut short. */
  selfEmail?: string | null;
}): React.JSX.Element {
  const { formats, t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  const versions = state.versions.slice(0, HISTORY_PREVIEW_LIMIT);
  const currentBranch = state.snapshot?.branch ?? null;
  const error = state.error ? localizeAppError(state.error, t, t.overviewHistoryError) : null;

  // Unpublished versions are said once, as a label over their run, rather
  // than "Not published" on every row; a "Published" label marks where the
  // published ones begin. Only when something is unpublished — otherwise
  // nothing needs saying — and never over an "unknown" run (no upstream to
  // compare with), which is neither.
  const hasLocalRun = versions.some((version) => version.publication === "local-only");
  const groupLabelFor = (publication: SavedVersionSummary["publication"]): string | null =>
    publication === "local-only"
      ? t.overviewHistoryLocalGroup
      : publication === "published"
        ? t.overviewHistoryPublishedGroup
        : null;

  const openVersion = (commit: string): void => {
    controller.selectVersion(query, commit);
    onOpenHistory();
  };

  return (
    <section className="overview-history" aria-labelledby="overview-history-title" aria-busy={state.isLoading || isRefreshing}>
      <header className="overview-history__header">
        <div className="overview-history__heading">
          <span className="overview-history__icon" aria-hidden="true">
            {/* Turns only for a refresh of a list already shown; the first
                read draws the list's shape below instead. */}
            {(state.isLoading || isRefreshing) && state.snapshot ? <LoaderCircle className="icon--spinning" /> : <GitCommitHorizontal />}
          </span>
          <div>
            <h2 id="overview-history-title">{t.overviewHistoryTitle}</h2>
            <p>{t.overviewHistoryDescription}</p>
          </div>
        </div>
        {state.snapshot && state.versions.length > 0 && (
          <button className="overview-history__all" type="button" onClick={onOpenHistory}>
            {t.overviewHistoryViewAll}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>

      {!state.snapshot && !error ? (
        <LoadingPlaceholder label={t.overviewHistoryLoading}>
          <ol className="overview-history__list">
            {HISTORY_PLACEHOLDER_WIDTHS.map(([subject, meta]) => (
              <li key={subject}>
                <span className="overview-history__row">
                  <span className="overview-history__node" />
                  <span className="overview-history__body">
                    <span className="overview-history__subject"><TextPlaceholder width={subject} /></span>
                    <span className="overview-history__meta"><TextPlaceholder width={meta} /></span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </LoadingPlaceholder>
      ) : !state.snapshot && error ? (
        <div className="overview-history__state overview-history__state--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>{t.overviewHistoryErrorTitle}</strong>
            <p>{error}</p>
            <button className="secondary-button" type="button" onClick={() => void controller.refresh(query)}>
              {t.overviewHistoryRetry}
            </button>
          </div>
        </div>
      ) : versions.length === 0 ? (
        <div className="overview-history__state">
          <GitCommitHorizontal aria-hidden="true" />
          <div>
            <strong>{t.overviewHistoryEmptyTitle}</strong>
            <p>{t.overviewHistoryEmptyDescription}</p>
          </div>
        </div>
      ) : (
        <ol className="overview-history__list" aria-label={t.overviewHistoryListLabel}>
          {versions.map((version, index) => {
            const title = versionTitle(version, t.overviewHistoryUntitled);
            const fullAuthor = version.author?.name.trim() || t.overviewHistoryUnknownAuthor;
            const isSelf = isSelfAuthor(version.author, selfEmail);
            const author = isSelf ? t.overviewHistoryYou : fullAuthor;
            const date = formatHistoryDate(version.authoredAt, formats);
            // The row's `aria-label` replaces its subtree, so the badge only
            // reaches assistive tech by being folded into the label.
            const decoration = primaryDecoration(version, currentBranch);
            // A version still only on this computer is marked as such, and its
            // row offers to publish it (and everything older) under the
            // pointer — the one place partial publishing lives on this screen.
            const isLocalOnly = version.publication === "local-only";
            const labelParts = [t.overviewHistoryOpenVersion(title)];
            if (decoration) labelParts.push(decorationLabel(decoration, t));
            if (isLocalOnly) labelParts.push(t.overviewHistoryLocalOnly);
            const canPublishUpTo = isLocalOnly && canPublish && Boolean(onPublishUpTo);
            const startsGroup = index === 0 || version.publication !== versions[index - 1].publication;
            const groupLabel = hasLocalRun && startsGroup ? groupLabelFor(version.publication) : null;
            return (
              <React.Fragment key={version.commit}>
              {/* Decorative for assistive tech: every row's own label already
                  says whether it is published. */}
              {groupLabel && (
                <li
                  className={`overview-history__group${isLocalOnly ? " overview-history__group--local" : ""}`}
                  aria-hidden="true"
                >
                  {isLocalOnly && <Monitor />}
                  {groupLabel}
                </li>
              )}
              <li
                className={`row-in${isLocalOnly ? " overview-history__item--local" : ""}${canPublishUpTo ? " overview-history__item--publishable" : ""}`}
                style={{ "--row-index": index } as React.CSSProperties}
              >
                <button
                  className="overview-history__row"
                  type="button"
                  onClick={() => openVersion(version.commit)}
                  aria-label={labelParts.join(" — ")}
                >
                  <span className="overview-history__node" aria-hidden="true" />
                  <span className="overview-history__body">
                    <span className="overview-history__subject" title={title}>{title}</span>
                    <span className="overview-history__meta">
                      <span className="overview-history__author" title={fullAuthor}>{author}</span>
                      <HistoryRefBadge version={version} currentBranch={currentBranch} currentLabel={t.overviewHistoryCurrentLine} />
                      {date && <><HistoryMetaDot /><span className="overview-history__date" title={date.absolute}>{date.relative}</span></>}
                    </span>
                  </span>
                  <ChevronRight className="overview-history__chevron" aria-hidden="true" />
                </button>
                {/* The action is the node itself: under the pointer or focus
                    the timeline's dot grows to a pressable size, filled solid
                    in the accent, sitting over the row's own node since it
                    cannot live inside the row's button. At rest it is hidden
                    so the band's current step stays the one solid accent on
                    the page. The tooltip carries the words. */}
                {canPublishUpTo && (
                  <button
                    className="overview-history__publish"
                    type="button"
                    onClick={() => onPublishUpTo?.(version.commit)}
                    aria-label={`${t.overviewPublishUpTo}: ${title}`}
                    data-tooltip={`${t.overviewPublishUpTo} · ${t.overviewPublishUpToHint}`}
                  >
                    <CloudUpload aria-hidden="true" />
                  </button>
                )}
              </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}

      {state.snapshot && error && (
        <div className="overview-history__stale" role="alert">
          <span>{t.overviewHistoryRefreshFailed}</span>
          <button className="secondary-button" type="button" onClick={() => void controller.refresh(query)}>
            {t.overviewHistoryRetry}
          </button>
        </div>
      )}
    </section>
  );
}
