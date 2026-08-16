import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CloudCog,
  LoaderCircle,
  RefreshCw,
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

function shortCommit(value: string | null, fallback: string): string {
  return value ? value.slice(0, 12) : fallback;
}

export function TeamChangesSection({
  state,
  canPublish,
  onCheck,
  onPublish,
  onReviewAndGet,
}: {
  state: TeamSyncViewState;
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
    }
  }, [headline, message, state.isCheckingRemote]);

  const showCheck = !status || status.nextActions.includes("checkAgain") || state.isStale || Boolean(state.error);
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

  return (
    <section className={`team-changes team-changes--${tone}`} aria-labelledby="team-changes-title" aria-busy={state.isCheckingRemote}>
      <div className="team-changes__icon" aria-hidden="true">
        {state.isCheckingRemote ? <LoaderCircle className="icon--spinning" /> : (presentation?.icon ?? <CloudCog />)}
      </div>
      <div className="team-changes__body">
        <h2 id="team-changes-title">{t.syncTitle}</h2>
        <div className="team-changes__summary">
          <h3>{headline}</h3>{" — "}
          <p>{message}</p>
        </div>
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
        {status && (
          <details className="team-changes__details">
            <summary><ChevronDown aria-hidden="true" />{t.syncTechnicalDetails}</summary>
            <dl>
              <div><dt>{t.syncRemote}</dt><dd>{status.upstreamRemote ?? t.syncNotAvailable}</dd></div>
              <div><dt>{t.syncDestination}</dt><dd>{status.destinationBranch ?? t.syncNotAvailable}</dd></div>
              <div><dt>{t.syncTrackingRef}</dt><dd>{status.trackingRef ?? t.syncNotAvailable}</dd></div>
              <div><dt>{t.syncLocalCommit}</dt><dd>{shortCommit(status.localCommit, t.syncNotAvailable)}</dd></div>
              <div><dt>{t.syncRemoteCommit}</dt><dd>{shortCommit(status.remoteCommit, t.syncNotAvailable)}</dd></div>
              <div><dt>{t.syncAheadCount}</dt><dd>{status.ahead}</dd></div>
              <div><dt>{t.syncBehindCount}</dt><dd>{status.behind}</dd></div>
            </dl>
          </details>
        )}
      </div>
      <div className="team-changes__actions">
        {showCheck && (
          <button
            className={showPublish || status?.state === "upToDate" ? "secondary-button" : "primary-button"}
            type="button"
            onClick={onCheck}
            disabled={state.isCheckingRemote}
          >
            <RefreshCw aria-hidden="true" className={state.isCheckingRemote ? "icon--spinning" : undefined} />
            {state.isCheckingRemote ? t.syncChecking : status ? t.syncCheckAgain : t.syncCheck}
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
