import React, { useId } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Cloud,
  CloudCog,
  CloudUpload,
  Eye,
  GitBranch,
  History,
  LoaderCircle,
  RotateCw,
  Save,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import type { Journey } from "./journey";
import type { NextStep, NextStepAction, NextStepKind } from "./nextStep";
import { NextStepPlaceholder } from "./OverviewPlaceholder";

export type NextStepHandlers = Record<NextStepAction, () => void>;

const KIND_ICONS: Record<NextStepKind, React.JSX.Element> = {
  loading: <LoaderCircle className="icon--spinning" />,
  localError: <CircleAlert />,
  conflicts: <Split />,
  save: <Save />,
  firstSave: <Save />,
  publish: <CloudUpload />,
  unpublished: <CloudUpload />,
  behind: <ArrowDownToLine />,
  diverged: <Split />,
  checking: <LoaderCircle className="icon--spinning" />,
  notChecked: <Cloud />,
  unavailable: <CircleAlert />,
  noRemote: <Check />,
  noUpstream: <CloudCog />,
  detached: <History />,
  unborn: <Save />,
  upToDate: <Check />,
};

const ACTION_ICONS: Record<NextStepAction, React.JSX.Element> = {
  save: <Save aria-hidden="true" />,
  reviewChanges: <Eye aria-hidden="true" />,
  resolve: <TriangleAlert aria-hidden="true" />,
  publish: <CloudUpload aria-hidden="true" />,
  openHistory: <History aria-hidden="true" />,
  getChanges: <ArrowDownToLine aria-hidden="true" />,
  checkRemote: <RotateCw aria-hidden="true" />,
  checkLocal: <RotateCw aria-hidden="true" />,
  openSettings: <Cloud aria-hidden="true" />,
  openLines: <GitBranch aria-hidden="true" />,
};

/**
 * The one card that says what to do now, and why, with the button that does
 * it. The three steps of the model survive as a thin progress bar in the
 * card's caption.
 *
 * The state's colour washes in from the card's top-left corner (Linear's and
 * Arc's highlighted cards) and tints its edge, from the theme's own status
 * tokens; with nothing waiting the card is plain. It is always one colour:
 * what comes after this step is said in a neutral pill, never in a second
 * hue. The primary button keeps the theme's accent in every state but
 * overlaps, so "the action" is always the same colour.
 */
export function NextStepCard({
  nextStep,
  journey,
  handlers,
}: {
  nextStep: NextStep;
  journey: Journey;
  handlers: NextStepHandlers;
}): React.JSX.Element {
  const { t } = useLanguage();
  const titleId = useId();
  const { changes, publish } = journey;
  const { kind, tone, primary, secondary, progress, isPending, then } = nextStep;
  const remote = publish.remote;
  // The project not read yet: the card's shape, as on the whole screen's
  // placeholder, so it fills in place instead of saying "checking" first.
  if (kind === "loading") return <NextStepPlaceholder label={t.overviewJourneyNoteIdle} />;

  const kicker =
    kind === "conflicts" ? t.overviewNextKickerDecide
      : kind === "behind" || kind === "diverged" ? t.overviewNextKickerBefore
        : primary ? t.overviewNextKickerNext
          : kind === "upToDate" ? t.overviewNextKickerAllGood
            : kind === "noRemote" ? t.overviewNextKickerSaved
              : t.overviewNextKickerStatus;

  let title: string;
  let hint: string;
  switch (kind) {
    case "localError": title = t.statusCheckFailedTitle; hint = t.statusCouldntCheck; break;
    case "conflicts": title = t.overviewNextConflictsTitle(changes.conflicted); hint = t.overviewNextConflictsHint; break;
    case "save": title = t.overviewNextSaveTitle(changes.total); hint = t.overviewJourneyNoteSave; break;
    case "firstSave": title = t.overviewNextFirstSaveTitle; hint = t.overviewNextFirstSaveHint(changes.total); break;
    case "publish": title = t.overviewNextPublishTitle(publish.pending, remote); hint = t.overviewJourneyNoteAhead; break;
    case "unpublished": title = t.overviewJourneyReadyToPublish(publish.pending); hint = t.overviewJourneyNoteAhead; break;
    case "behind": title = t.overviewNextBehindTitle(publish.behind, remote); hint = t.syncBehindMessage; break;
    case "diverged": title = t.overviewNextDivergedTitle(publish.behind); hint = t.overviewNextDivergedHint(remote); break;
    case "checking": title = t.syncChecking; hint = t.syncCheckingMessage; break;
    case "notChecked": title = t.syncNotCheckedTitle; hint = t.syncNotCheckedMessage; break;
    case "unavailable": title = t.overviewNextUnavailableTitle(remote); hint = t.overviewNextUnavailableHint; break;
    case "noRemote": title = t.overviewNextNoRemoteTitle; hint = t.overviewNextNoRemoteHint; break;
    case "noUpstream": title = t.overviewJourneyNoUpstream; hint = t.syncNoUpstreamMessage; break;
    case "detached": title = t.overviewNextDetachedTitle; hint = t.overviewNextDetachedHint; break;
    case "unborn": title = t.syncUnbornTitle; hint = t.syncUnbornMessage; break;
    case "upToDate": title = t.overviewNextUpToDateTitle; hint = t.overviewNextUpToDateHint(remote); break;
  }

  const actionLabel = (action: NextStepAction): string => {
    switch (action) {
      case "save": return t.overviewSaveVersion;
      case "reviewChanges": return t.overviewReviewChanges;
      case "resolve": return t.overviewJourneyResolve;
      case "publish": return t.overviewPublishAll(publish.pending);
      case "openHistory": return t.changesEmptyViewHistory;
      case "getChanges": return t.syncReviewAndGet;
      case "checkRemote": return kind === "unavailable" ? t.syncCheckAgain : t.overviewFactsCheck;
      case "checkLocal": return t.overviewCheckLocalAgain;
      case "openSettings": return t.overviewNextConnectRemote;
      case "openLines": return t.overviewNextOpenLines;
    }
  };

  const glyphIcon = isPending ? <LoaderCircle className="icon--spinning" /> : KIND_ICONS[kind];
  const failed = kind === "unavailable" || kind === "localError";
  const segments = [0, 1, 2].map((index) =>
    index === progress.current ? "current" : index < progress.done ? "done" : "todo",
  );

  return (
    <section className={`next-step next-step--${tone}`} aria-labelledby={titleId}>
      <span
        // Breathes once as a step becomes current: the one moving thing on
        // the page, marking the one thing to do.
        key={primary ? kind : "idle"}
        className={`next-step__glyph${failed ? " next-step__glyph--failed" : ""}${primary ? " attention-breathe" : ""}`}
        aria-hidden="true"
      >
        {glyphIcon}
      </span>
      <div className="next-step__copy">
        <p className="next-step__kicker">
          <span>{kicker}</span>
          <span className="next-step__progress" role="img" aria-label={t.overviewNextProgress(progress.done)}>
            {segments.map((segment, index) => (
              <i key={index} className={`next-step__segment next-step__segment--${segment}`} />
            ))}
          </span>
        </p>
        <h2 id={titleId} className="next-step__title">{title}</h2>
        <p className="next-step__hint">{hint}</p>
        {then && (
          <p className="next-step__then">
            <span className="next-step__then-glyph" aria-hidden="true">
              {then.kind === "get" ? <ArrowDownToLine /> : <CloudUpload />}
            </span>
            <span>
              {t.overviewNextThen}{" "}
              {then.kind === "get" ? (
                <><strong>{t.overviewNextThenGet(then.count)}</strong>{remote ? ` ${t.overviewNextThenOn(remote)}` : ""}</>
              ) : (
                <strong>{t.overviewNextThenPublish(then.count)}</strong>
              )}
            </span>
          </p>
        )}
      </div>
      {(primary || secondary.length > 0) && (
        <div className="next-step__actions">
          {secondary.map((action) => (
            <button
              key={action}
              className="secondary-button"
              type="button"
              onClick={handlers[action]}
              disabled={action === "checkRemote" && publish.isChecking}
              aria-label={action === "checkRemote" && kind !== "unavailable" ? t.statusBarCheckNow : undefined}
            >
              {action === "checkRemote" && publish.isChecking ? <LoaderCircle aria-hidden="true" className="icon--spinning" /> : ACTION_ICONS[action]}
              {actionLabel(action)}
            </button>
          ))}
          {primary && (
            <button
              className={`primary-button${primary === "resolve" || primary === "checkLocal" ? " next-step__primary--blocked" : ""}`}
              type="button"
              onClick={handlers[primary]}
            >
              {ACTION_ICONS[primary]}
              {actionLabel(primary)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
