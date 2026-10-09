import React, { useMemo } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  CircleAlert,
  Cloud,
  CloudUpload,
  GitCommitHorizontal,
  Laptop,
  LoaderCircle,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { LoadingPlaceholder } from "../../shared/ui";
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
import { useFitCount, useOverviewFits } from "./fit";
import { HistoryPlaceholderList } from "./OverviewPlaceholder";

/** Versions shown while the screen scrolls as a page. */
const HISTORY_PREVIEW_LIMIT = 6;
/** The most versions the timeline draws when it fits the window — enough for
 * a tall screen, all from the history's first page. */
const HISTORY_FIT_LIMIT = 30;
/** The rail's fading end under the last version shown, with its gap. */
const TIMELINE_TAIL_SPACE = 34;

function versionTitle(version: SavedVersionSummary, fallback: string): string {
  return version.subject.trim() || fallback;
}

/**
 * Overview's living history: one timeline that tells where all of the work
 * is. Its first node is "now" — the files not saved yet, passed in as `now` —
 * then the versions still only on this computer, grouped under one label,
 * then a mark where the remote's copy of the line begins, then what is
 * published. The grouping is what the old band of three tiles said in
 * numbers, drawn in the shape of the History screen instead.
 */
export function HistorySummarySection({
  controller,
  projectPath,
  sessionEpoch,
  isRefreshing = false,
  canPublish = false,
  onOpenHistory,
  onPublishUpTo,
  selfEmail = null,
  now = null,
  incoming = null,
  hasNoRemote = false,
}: {
  controller: HistoryController;
  projectPath: string;
  sessionEpoch: string;
  isRefreshing?: boolean;
  /** Whether a version that is still only on this computer may be offered
   * "publish up to here" — the same gate as the next-step card's Publish. */
  canPublish?: boolean;
  onOpenHistory: () => void;
  /** Publishes this version and every older one under it, through the
   * previewed publish flow. Only offered on rows the inventory says are not
   * yet published, and only when `canPublish`. */
  onPublishUpTo?: (commit: string) => void;
  /** The user's own Git email: their versions say "You" rather than their
   * full name, which was the first thing the row's meta cut short. */
  selfEmail?: string | null;
  /** The timeline's first node, the working tree (`OverviewNow`). */
  now?: React.ReactNode;
  /** Versions the last remote check found waiting, drawn above "now" with
   * the way to get them. */
  incoming?: { count: number; remote: string | null; onGet: () => void } | null;
  /** With no remote, every version is only on this computer: the group says
   * so in the unsaved colour rather than the accent's "ready". */
  hasNoRemote?: boolean;
}): React.JSX.Element {
  const { formats, t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveHistoryState(controller, query);
  const fits = useOverviewFits();
  // Everything that changes what the rows are, or which come before them.
  const contentKey = [
    state.snapshot?.snapshotToken ?? "",
    state.versions.length,
    state.versions[0]?.commit ?? "",
    Boolean(now),
    incoming?.count ?? 0,
  ].join("|");
  const fit = useFitCount<HTMLDivElement>({
    fits,
    max: HISTORY_FIT_LIMIT,
    fallback: HISTORY_PREVIEW_LIMIT,
    reserve: TIMELINE_TAIL_SPACE,
    contentKey,
  });
  const versions = state.versions.slice(0, fit.count);
  // More saved versions than drawn: the rail runs on past the last one and
  // fades, saying the line goes on without a count — "View all" is above.
  const continues = state.versions.length > versions.length || Boolean(state.snapshot?.hasMore);
  const currentBranch = state.snapshot?.branch ?? null;
  const upstream = state.snapshot?.upstream ?? null;
  const upstreamRef = upstream?.trackingRef ?? null;
  const error = state.error ? localizeAppError(state.error, t, t.overviewHistoryError) : null;

  // The versions that have not left this computer are the newest ones, so
  // they lead the list; everything after the first published one is history
  // the remote already holds.
  const firstShared = versions.findIndex((version) => version.publication !== "local-only");
  const local = firstShared === -1 ? versions : versions.slice(0, firstShared);
  const shared = firstShared === -1 ? [] : versions.slice(firstShared);
  const localTotal = state.versions.findIndex((version) => version.publication !== "local-only");
  const localCount = localTotal === -1 ? state.versions.length : localTotal;

  const openVersion = (commit: string): void => {
    controller.selectVersion(query, commit);
    onOpenHistory();
  };

  const renderRow = (version: SavedVersionSummary, index: number): React.JSX.Element => {
    const title = versionTitle(version, t.overviewHistoryUntitled);
    const fullAuthor = version.author?.name.trim() || t.overviewHistoryUnknownAuthor;
    const isSelf = isSelfAuthor(version.author, selfEmail);
    const author = isSelf ? t.overviewHistoryYou : fullAuthor;
    const date = formatHistoryDate(version.authoredAt, formats);
    // The row's `aria-label` replaces its subtree, so the badge only reaches
    // assistive tech by being folded into the label. The current line's own
    // copy on the remote is not badged: the mark above it already says where
    // the remote's copy begins.
    const primary = primaryDecoration(version, currentBranch);
    const decoration = primary && primary.fullRef === upstreamRef ? null : primary;
    const isLocalOnly = version.publication === "local-only";
    const labelParts = [t.overviewHistoryOpenVersion(title)];
    if (decoration) labelParts.push(decorationLabel(decoration, t));
    if (isLocalOnly) labelParts.push(t.overviewHistoryLocalOnly);
    const canPublishUpTo = isLocalOnly && canPublish && Boolean(onPublishUpTo);
    return (
      <li
        key={version.commit}
        data-fit-row=""
        className={`overview-timeline__item row-in${isLocalOnly ? " overview-history__item--local" : ""}${canPublishUpTo ? " overview-history__item--publishable" : ""}`}
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
              {decoration && <HistoryRefBadge version={version} currentBranch={currentBranch} currentLabel={t.overviewHistoryCurrentLine} />}
              {date && <><HistoryMetaDot /><span className="overview-history__date" title={date.absolute}>{date.relative}</span></>}
            </span>
          </span>
          <ChevronRight className="overview-history__chevron" aria-hidden="true" />
        </button>
        {/* The action is the node itself: under the pointer or focus the
            timeline's dot grows to a pressable size, filled solid in the
            accent, over the row's own node since it cannot live inside the
            row's button. The tooltip carries the words. */}
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
  };

  const incomingItem = incoming ? (
    <li className="overview-timeline__incoming-item">
      <button className="overview-timeline__incoming" type="button" onClick={incoming.onGet}>
        <span className="overview-timeline__incoming-node" aria-hidden="true" />
        <span className="overview-timeline__incoming-text">
          <span className="overview-timeline__incoming-where">{incoming.remote ?? t.overviewSceneRemote}</span>
          <span aria-hidden="true">·</span>
          <strong>{t.overviewTimelineIncoming(incoming.count)}</strong>
        </span>
        <span className="overview-timeline__incoming-action">
          <ArrowDownToLine aria-hidden="true" />
          {t.overviewTimelineGet}
        </span>
      </button>
    </li>
  ) : null;
  const nowItem = now || incomingItem ? (
    <>
      {incomingItem}
      {now && <li className="overview-timeline__now">{now}</li>}
    </>
  ) : null;

  return (
    <section className="overview-history" aria-labelledby="overview-history-title" aria-busy={state.isLoading || isRefreshing}>
      <header className="overview-history__header">
        <h2 id="overview-history-title">
          {t.overviewHistoryTitle}
          {/* Turns only for a refresh of a list already shown; the first read
              draws the list's shape below instead. */}
          {(state.isLoading || isRefreshing) && state.snapshot && (
            <LoaderCircle aria-hidden="true" className="icon--spinning overview-history__refreshing" />
          )}
        </h2>
        {state.snapshot && state.versions.length > 0 && (
          <button className="overview-history__all" type="button" onClick={onOpenHistory}>
            {t.overviewHistoryViewAll}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="overview-history__fit" ref={fit.ref}>
        {!state.snapshot && !error ? (
          <>
            {nowItem && <ol className="overview-timeline">{nowItem}</ol>}
            <LoadingPlaceholder label={t.overviewHistoryLoading}>
              <HistoryPlaceholderList />
            </LoadingPlaceholder>
          </>
        ) : !state.snapshot && error ? (
          <>
            {nowItem && <ol className="overview-timeline">{nowItem}</ol>}
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
          </>
        ) : versions.length === 0 ? (
          <>
            {nowItem && <ol className="overview-timeline">{nowItem}</ol>}
            <div className="overview-history__state">
              <GitCommitHorizontal aria-hidden="true" />
              <div>
                <strong>{t.overviewHistoryEmptyTitle}</strong>
                <p>{t.overviewHistoryEmptyDescription}</p>
              </div>
            </div>
          </>
        ) : (
          <ol className={`overview-timeline${continues ? " overview-timeline--continues" : ""}`} aria-label={t.overviewHistoryListLabel}>
            {nowItem}
            {local.length > 0 && (
              <li className={`overview-timeline__group${hasNoRemote ? " overview-timeline__group--alone" : ""}`}>
                <p className="overview-timeline__group-head">
                  <span className="overview-timeline__group-icon" aria-hidden="true"><Laptop /></span>
                  <span className="overview-timeline__group-label">{t.overviewTimelineLocalGroup}</span>
                  <span className="overview-timeline__group-count">{t.overviewTimelineLocalCount(localCount)}</span>
                </p>
                <ol className="overview-timeline__rows">
                  {local.map((version, index) => renderRow(version, index))}
                </ol>
              </li>
            )}
            {upstream && shared.length > 0 && (
              <li className="overview-timeline__mark" title={upstream.trackingRef}>
                <span className="overview-timeline__mark-icon" aria-hidden="true"><Cloud /></span>
                <span className="overview-timeline__mark-text">
                  {t.overviewTimelinePublishedOn}{" "}
                  <span className="overview-timeline__mono">
                    {upstream.destinationBranch === currentBranch
                      ? upstream.remote
                      : `${upstream.remote} · ${upstream.destinationBranch}`}
                  </span>
                </span>
              </li>
            )}
            {shared.map((version, index) => renderRow(version, local.length + index))}
            {continues && <li className="overview-timeline__tail" aria-hidden="true" />}
          </ol>
        )}
      </div>

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
