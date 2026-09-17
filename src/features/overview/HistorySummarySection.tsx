import { useMemo } from "react";
import {
  ChevronRight,
  CircleAlert,
  GitCommitHorizontal,
  CloudUpload,
  LoaderCircle,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import {
  decorationLabel,
  formatHistoryDate,
  HistoryMetaDot,
  HistoryRefBadge,
  primaryDecoration,
  useActiveHistoryState,
  type HistoryController,
  type SavedVersionSummary,
} from "../history";

const HISTORY_PREVIEW_LIMIT = 4;

function versionTitle(version: SavedVersionSummary, fallback: string): string {
  return version.subject.trim() || fallback;
}

export function HistorySummarySection({
  controller,
  projectPath,
  sessionEpoch,
  isRefreshing = false,
  canPublish = false,
  onOpenHistory,
  onPublishUpTo,
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
}): React.JSX.Element {
  const { formats, t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  const versions = state.versions.slice(0, HISTORY_PREVIEW_LIMIT);
  const currentBranch = state.snapshot?.branch ?? null;
  const error = state.error ? localizeAppError(state.error, t, t.overviewHistoryError) : null;

  const openVersion = (commit: string): void => {
    controller.selectVersion(query, commit);
    onOpenHistory();
  };

  return (
    <section className="overview-history" aria-labelledby="overview-history-title" aria-busy={state.isLoading || isRefreshing}>
      <header className="overview-history__header">
        <div className="overview-history__heading">
          <span className="overview-history__icon" aria-hidden="true">
            {state.isLoading || isRefreshing ? <LoaderCircle className="icon--spinning" /> : <GitCommitHorizontal />}
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
        <div className="overview-history__loading" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          <span>{t.overviewHistoryLoading}</span>
        </div>
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
            const author = version.author?.name.trim() || t.overviewHistoryUnknownAuthor;
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
            return (
              <li
                key={version.commit}
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
                      <span className="overview-history__author" title={author}>{author}</span>
                      <HistoryRefBadge version={version} currentBranch={currentBranch} />
                      {isLocalOnly && (
                        <>
                          <HistoryMetaDot />
                          <span className="overview-history__local">{t.overviewHistoryLocalOnly}</span>
                        </>
                      )}
                      {date && <><HistoryMetaDot /><span className="overview-history__date" title={date.absolute}>{date.relative}</span></>}
                    </span>
                  </span>
                  <ChevronRight className="overview-history__chevron" aria-hidden="true" />
                </button>
                {/* The action is the node itself: the timeline's dot, grown to
                    a pressable size and filled solid in the accent — the same
                    "do this" mark as the band's current step — sitting over
                    the row's own node, since it cannot live inside the row's
                    button. The tooltip carries the words. */}
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
