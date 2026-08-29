import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudCog,
  GitBranch,
  LoaderCircle,
  Send,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import type { TeamSyncState, TeamSyncViewState } from "./domain";

type Presentation = {
  tone: "success" | "attention" | "danger" | "neutral";
  title: string;
  message: string;
  icon: React.JSX.Element;
};

function presentationFor(
  state: TeamSyncState,
  ahead: number,
  behind: number,
  t: ReturnType<typeof useLanguage>["t"],
): Presentation {
  switch (state) {
    case "upToDate":
      return { tone: "success", title: t.syncUpToDateTitle, message: t.syncUpToDateMessage, icon: <CheckCircle2 /> };
    case "ahead":
      return { tone: "neutral", title: t.syncAheadTitle(ahead), message: t.syncAheadMessage, icon: <Send /> };
    case "behind":
      return { tone: "attention", title: t.syncBehindTitle(behind), message: t.syncBehindMessage, icon: <ArrowDownToLine /> };
    case "diverged":
      return { tone: "danger", title: t.syncDivergedTitle, message: t.syncDivergedMessage, icon: <Split /> };
    case "noRemote":
      return { tone: "attention", title: t.syncNoRemoteTitle, message: t.syncNoRemoteMessage, icon: <CloudCog /> };
    case "noUpstream":
      return { tone: "attention", title: t.syncNoUpstreamTitle, message: t.syncNoUpstreamMessage, icon: <CloudCog /> };
    case "detached":
      return { tone: "attention", title: t.syncDetachedTitle, message: t.syncDetachedMessage, icon: <TriangleAlert /> };
    case "unborn":
      return { tone: "neutral", title: t.syncUnbornTitle, message: t.syncUnbornMessage, icon: <CloudCog /> };
    case "unknown":
      return { tone: "danger", title: t.syncUnknownTitle, message: t.syncUnknownMessage, icon: <CircleAlert /> };
  }
}

export function TeamChangesSection({
  state,
  isRefreshing = false,
  canPublish,
  onCheck,
  onPublish,
  onReviewAndGet,
}: {
  state: TeamSyncViewState;
  isRefreshing?: boolean;
  canPublish: boolean;
  onCheck: () => void;
  onPublish: () => void;
  onReviewAndGet: () => void;
}): React.JSX.Element {
  const { t, language } = useLanguage();
  const { status } = state;
  const [announcement, setAnnouncement] = useState("");
  const wasCheckingRef = useRef(false);

  const checkedAt = status?.checkedAt ?? state.lastSuccessfulCheckAt;
  const checkedLabel = checkedAt
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(checkedAt)
    : null;
  const presentation = status
    ? presentationFor(status.state, status.ahead, status.behind, t)
    : null;
  const headline = state.isCheckingRemote && !status
    ? t.syncCheckingTitle
    : state.error && !status
      ? t.syncUnavailableTitle
      : (presentation?.title ?? t.syncNotCheckedTitle);
  const message = state.isCheckingRemote && !status
    ? t.syncCheckingMessage
    : state.error && !status
      ? state.error
      : (presentation?.message ?? t.syncNotCheckedMessage);

  useEffect(() => {
    if (state.isCheckingRemote) {
      wasCheckingRef.current = true;
      setAnnouncement("");
    } else if (wasCheckingRef.current) {
      wasCheckingRef.current = false;
      setAnnouncement(`${headline}. ${message}`);
    } else if (announcement) {
      const nextAnnouncement = `${headline}. ${message}`;
      if (announcement !== nextAnnouncement) {
        setAnnouncement(nextAnnouncement);
      }
    }
  }, [announcement, headline, message, state.isCheckingRemote]);

  const showPublish = Boolean(status?.nextActions.includes("publishChanges")) && canPublish;
  const showReviewAndGet = Boolean(
    status?.nextActions.includes("reviewAndGet") &&
    status.state === "behind" &&
    status.knowledge === "fresh" &&
    status.checkedAt !== null &&
    !state.isStale &&
    !state.isLoading &&
    !state.error
  );
  const showStaleWarning = state.isStale && !state.isLoading;
  const tone = state.error && !status ? "danger" : (presentation?.tone ?? "neutral");
  const teamDestination = status?.upstreamRemote && status.destinationBranch
    ? `${status.upstreamRemote}/${status.destinationBranch}`
    : null;
  const showRelationship = Boolean(status?.localBranch && teamDestination);

  const isChecking = state.isCheckingRemote || isRefreshing;
  const showCheck = !isChecking && (status === null || state.isStale || state.error !== null);

  return (
    <section className={`team-changes team-changes--${tone}`} aria-labelledby="team-changes-title" aria-busy={isChecking}>
      <header className="team-changes__header">
        <div className="team-changes__heading">
          <span className="team-changes__icon" aria-hidden="true">
            {isChecking ? <LoaderCircle className="icon--spinning" /> : (presentation?.icon ?? <CloudCog />)}
          </span>
          <div>
            <h2 id="team-changes-title">{t.syncTitle}</h2>
            <p>{headline}</p>
          </div>
        </div>
      </header>
      <div className="team-changes__body">
        <p className="team-changes__summary">{message}</p>
        {showRelationship && status?.localBranch && teamDestination && (
          <div
            className="team-changes__relationship"
            aria-label={t.syncRelationshipLabel(status.localBranch, teamDestination)}
          >
            <span className="team-changes__endpoint">
              <GitBranch aria-hidden="true" />
              <span>
                <small>{t.syncCurrentLine}</small>
                <strong title={status.localBranch}>{status.localBranch}</strong>
              </span>
            </span>
            <ArrowLeftRight className="team-changes__relationship-arrow" aria-hidden="true" />
            <span className="team-changes__endpoint">
              <Cloud aria-hidden="true" />
              <span>
                <small>{t.syncTeamLine}</small>
                <strong title={teamDestination}>{teamDestination}</strong>
              </span>
            </span>
          </div>
        )}
        <div className="team-changes__knowledge" aria-live="polite">
          {showStaleWarning ? (
            <span className="team-changes__stale"><TriangleAlert aria-hidden="true" />{t.syncStaleNote}</span>
          ) : status?.knowledge === "cached" ? (
            <span>{t.syncCachedNote}</span>
          ) : null}
          {checkedLabel && <span>{t.syncLastChecked(checkedLabel)}</span>}
        </div>
        {state.error && status && (
          <p className="team-changes__error" role="alert"><CircleAlert aria-hidden="true" />{state.error}</p>
        )}
      </div>
      <div className="team-changes__actions">
        {showCheck && (
          <button className="secondary-button" type="button" onClick={onCheck}>
            <Cloud aria-hidden="true" />
            {status || state.error ? t.syncCheckAgain : t.syncCheck}
          </button>
        )}
        {showPublish && (
          <button className="primary-button" type="button" onClick={onPublish}><Send aria-hidden="true" />{t.syncPublish}</button>
        )}
        {showReviewAndGet && (
          <button className="primary-button" type="button" onClick={onReviewAndGet}>
            <ArrowDownToLine aria-hidden="true" />
            <span>{t.syncReviewAndGet}</span>
          </button>
        )}
      </div>
      <span className="visually-hidden" role="status">{announcement}</span>
    </section>
  );
}
