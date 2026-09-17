import React, { useId, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  CloudCog,
  CloudUpload,
  Info,
  LoaderCircle,
  Pencil,
  RotateCw,
  Save,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import { formatRelativeCheckTime } from "../../shared/i18n";
import { CHANGE_CATEGORY_ICONS, type ChangeCategory } from "../status";
import type { Journey, JourneyStepId } from "./journey";

type Tone = "neutral" | "done" | "active" | "attention" | "danger" | "muted";

const CATEGORY_LABEL_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

/**
 * One step of the band: a button in its entirety, or a plain tile where the
 * state has nothing to press. Pressing goes to the screen that owns the step
 * — Changes, History, the remote check — and on the active step it runs the
 * step's own action, the same one the button under the band runs. The tiles
 * are deliberately all the same thing: the band is three facts, and the one
 * thing to do is said once, below it. `label` is the step's name, `value`
 * the fact, `hint` the line under it.
 */
function JourneyStep({
  id,
  tone,
  icon,
  label,
  labelNote,
  value,
  hint,
  onSelect,
  selectLabel,
}: {
  id: JourneyStepId;
  tone: Tone;
  icon: React.JSX.Element;
  label: string;
  /** "next step", beside the label, only on the active tile. */
  labelNote?: string;
  value: React.ReactNode;
  hint: React.ReactNode | null;
  onSelect?: () => void;
  selectLabel?: string;
}): React.JSX.Element {
  const className = `journey-step journey-step--${id} journey-step--${tone}`;
  // The current step — the accent one, or the warning one when overlaps come
  // first — is the one thing on the screen that asks for the eye, so its glyph
  // wears the app's one attention animation. "next step" beside the label is
  // what marks a tile as current.
  const isCurrent = tone === "active" || Boolean(labelNote);
  const iconClassName = `journey-step__icon${isCurrent ? " attention-breathe" : ""}`;
  // The button's name is what pressing it does; the copy is its description,
  // so the fact still reaches a screen reader after the action, rather than
  // being replaced by it.
  const copyId = useId();
  const body = (
    <>
      <span className={iconClassName} aria-hidden="true">
        {icon}
      </span>
      <span className="journey-step__copy" id={copyId}>
        <span className="journey-step__label">
          {label}
          {labelNote && <span className="journey-step__label-note"> · {labelNote}</span>}
          {onSelect && <ArrowRight className="journey-step__go" aria-hidden="true" />}
        </span>
        <span className="journey-step__value">{value}</span>
        {hint !== null && <span className="journey-step__hint">{hint}</span>}
      </span>
    </>
  );
  if (onSelect) {
    return (
      <button
        className={className}
        type="button"
        onClick={onSelect}
        aria-label={selectLabel}
        aria-describedby={copyId}
        aria-current={isCurrent ? "step" : undefined}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={className} aria-current={isCurrent ? "step" : undefined}>
      {body}
    </div>
  );
}

function Connector({ isDone }: { isDone: boolean }): React.JSX.Element {
  return <span className={`journey-connector${isDone ? " journey-connector--done" : ""}`} aria-hidden="true" />;
}

/**
 * The band across the top of Overview: change, then save, then publish, with
 * the one thing to do now carrying the one accent. It is the app's model of
 * Git drawn once rather than explained — a reader who has never heard of a
 * commit sees that saving comes before publishing and that nothing leaves
 * the computer until the third step.
 *
 * Every state the two status cards used to describe in prose is a state of
 * one of these three tiles instead, and the line under the band says what
 * the active tile means in one sentence.
 */
export function JourneySection({
  journey,
  breakdown,
  canPublish,
  onReviewChanges,
  onCheckLocalChanges,
  onSaveVersion,
  onPublish,
  onCheckTeamChanges,
  onReviewAndGetTeamChanges,
  onOpenProjectSettings,
  onOpenHistory,
}: {
  journey: Journey;
  breakdown: { category: ChangeCategory; count: number }[];
  canPublish: boolean;
  onReviewChanges: () => void;
  onCheckLocalChanges: () => void;
  onSaveVersion: () => void;
  onPublish: () => void;
  onCheckTeamChanges: () => void;
  onReviewAndGetTeamChanges: () => void;
  onOpenProjectSettings: () => void;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const headingId = useId();
  const { changes, save, publish, activeStep } = journey;
  // The same 30s clock the status bar keeps, and only while this screen is
  // the one on show: a hidden Overview must not tick.
  const [now, setNow] = useState(() => Date.now());
  useActiveScreenEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // ---- Changes ----
  // The same glyphs, in the same colours, as the rows in Changed files
  // below: a reader who learns one learns both.
  const breakdownText = breakdown.map((item) => t[CATEGORY_LABEL_KEYS[item.category]](item.count)).join(" · ");
  const breakdownHint = (
    <span className="journey-step__breakdown" aria-label={breakdownText}>
      {breakdown.map((item) => (
        <span key={item.category} className={`journey-step__kind journey-step__kind--${item.category}`}>
          {CHANGE_CATEGORY_ICONS[item.category]}
          {t[CATEGORY_LABEL_KEYS[item.category]](item.count)}
        </span>
      ))}
    </span>
  );
  let changesStep: React.JSX.Element;
  switch (changes.state) {
    case "loading":
      changesStep = (
        <JourneyStep id="changes" tone="muted" icon={<LoaderCircle className="icon--spinning" />}
          label={t.overviewJourneyChanges} value="…" hint={t.statusCheckingTitle} />
      );
      break;
    case "error":
      changesStep = (
        <JourneyStep id="changes" tone="danger" icon={<CircleAlert />} label={t.overviewJourneyChanges}
          value={t.statusCheckFailedTitle} hint={t.overviewCheckLocalAgain}
          onSelect={onCheckLocalChanges} selectLabel={t.overviewCheckLocalAgain} />
      );
      break;
    case "clean":
      changesStep = (
        <JourneyStep id="changes" tone="done" icon={<Check />} label={t.overviewJourneyChanges}
          value={t.overviewJourneyNoChanges} hint={t.overviewJourneyNothingChanged}
          onSelect={onReviewChanges} selectLabel={t.overviewReviewChanges} />
      );
      break;
    case "conflicts":
      changesStep = (
        <JourneyStep id="changes" tone="attention" icon={<TriangleAlert />} label={t.overviewJourneyChanges}
          labelNote={t.overviewJourneyNextStep} value={t.overviewJourneyResolve}
          hint={breakdownHint}
          onSelect={onReviewChanges} selectLabel={t.overviewJourneyResolve} />
      );
      break;
    case "dirty":
      changesStep = (
        <JourneyStep id="changes" tone="neutral" icon={<Pencil />} label={t.overviewJourneyChanges}
          value={t.statusBarUnsaved(changes.total)} hint={breakdownHint}
          onSelect={onReviewChanges} selectLabel={t.overviewReviewChanges} />
      );
      break;
  }

  // ---- Save ----
  let saveStep: React.JSX.Element;
  switch (save.state) {
    case "loading":
      saveStep = (
        <JourneyStep id="save" tone="muted" icon={<Save />} label={t.overviewJourneySave}
          value={t.overviewJourneySaveWaiting} hint={t.overviewJourneySaveWaitingHint} />
      );
      break;
    case "blocked":
      saveStep = (
        <JourneyStep id="save" tone="muted" icon={<Save />} label={t.overviewJourneySave}
          value={t.overviewJourneySaveBlocked} hint={t.overviewJourneySaveBlockedHint} />
      );
      break;
    case "done":
      saveStep = (
        <JourneyStep id="save" tone="done" icon={<Check />} label={t.overviewJourneySave}
          value={t.statusCleanTitle} hint={t.overviewJourneySaveDoneHint}
          onSelect={onOpenHistory} selectLabel={t.overviewHistoryViewAll} />
      );
      break;
    case "active":
      saveStep = (
        <JourneyStep id="save" tone="active" icon={<Save />} label={t.overviewJourneySave}
          labelNote={t.overviewJourneyNextStep} value={t.overviewSaveVersion}
          hint={t.overviewJourneySaveActive}
          onSelect={onSaveVersion} selectLabel={t.overviewSaveVersion} />
      );
      break;
  }

  // ---- Publish ----
  const checkedRelative = publish.checkedAt === null
    ? null
    : formatRelativeCheckTime(publish.checkedAt, now, formats.language, t.statusBarJustNow);
  const freshness = publish.isStale
    ? t.statusBarMayBeOutdated
    : publish.isCached
      ? t.statusBarLocalSnapshot
      : checkedRelative
        ? t.statusBarLastChecked(checkedRelative)
        : null;
  // When first, then which line — and the line gives way before the time
  // does: "origin/feature/…" is recognisable cut short, "checked 5 min ago"
  // is not.
  const remoteHint = (
    <span className="journey-step__remote">
      {freshness && <span className="journey-step__remote-when">{freshness}</span>}
      {publish.remoteLine && <span className="journey-step__mono">{publish.remoteLine}</span>}
    </span>
  );
  const isPublishActive = activeStep === "publish";
  const spinning = <LoaderCircle className="icon--spinning" />;
  let publishStep: React.JSX.Element;
  switch (publish.state) {
    case "checking":
      publishStep = (
        <JourneyStep id="publish" tone="muted" icon={<LoaderCircle className="icon--spinning" />}
          label={t.overviewJourneyPublish} value={t.syncChecking} hint={t.syncCheckingMessage} />
      );
      break;
    case "notChecked":
      publishStep = (
        <JourneyStep id="publish" tone="neutral" icon={publish.isChecking ? spinning : <Cloud />} label={t.overviewJourneyPublish}
          value={t.syncNotCheckedTitle} hint={t.overviewJourneyCheckHint}
          onSelect={onCheckTeamChanges} selectLabel={t.syncCheck} />
      );
      break;
    case "unavailable":
      publishStep = (
        <JourneyStep id="publish" tone="danger" icon={publish.isChecking ? spinning : <CircleAlert />} label={t.overviewJourneyPublish}
          value={t.syncUnavailableTitle} hint={publish.error ?? t.syncUnknownMessage}
          onSelect={onCheckTeamChanges} selectLabel={t.syncCheckAgain} />
      );
      break;
    case "upToDate":
      publishStep = (
        <JourneyStep id="publish" tone="done" icon={publish.isChecking ? spinning : <Check />} label={t.overviewJourneyPublish}
          value={t.syncUpToDateTitle} hint={remoteHint}
          onSelect={onCheckTeamChanges} selectLabel={t.statusBarCheckNow} />
      );
      break;
    case "ahead":
      publishStep = isPublishActive && canPublish ? (
        <JourneyStep id="publish" tone="active" icon={publish.isChecking ? spinning : <CloudUpload />} label={t.overviewJourneyPublish}
          labelNote={t.overviewJourneyNextStep} value={t.overviewPublishAll(publish.pending)}
          hint={remoteHint}
          onSelect={onPublish} selectLabel={t.overviewPublishAll(publish.pending)} />
      ) : (
        <JourneyStep id="publish" tone="neutral" icon={publish.isChecking ? spinning : <CloudUpload />} label={t.overviewJourneyPublish}
          value={t.overviewJourneyReadyToPublish(publish.pending)} hint={remoteHint}
          onSelect={canPublish ? onPublish : onCheckTeamChanges}
          selectLabel={canPublish ? t.syncPublish : t.statusBarCheckNow} />
      );
      break;
    case "behind":
      publishStep = (
        <JourneyStep id="publish" tone={isPublishActive ? "active" : "attention"} icon={publish.isChecking ? spinning : <ArrowDownToLine />}
          label={t.overviewJourneyPublish} labelNote={isPublishActive ? t.overviewJourneyNextStep : undefined}
          value={isPublishActive ? t.syncReviewAndGet : t.overviewJourneyNewerAvailable(publish.behind)}
          hint={isPublishActive ? t.overviewJourneyNewerAvailable(publish.behind) : remoteHint}
          onSelect={isPublishActive ? onReviewAndGetTeamChanges : onCheckTeamChanges}
          selectLabel={isPublishActive ? t.syncReviewAndGet : t.statusBarCheckNow} />
      );
      break;
    case "diverged":
      publishStep = (
        <JourneyStep id="publish" tone="attention" icon={publish.isChecking ? spinning : <Split />} label={t.overviewJourneyPublish}
          labelNote={isPublishActive ? t.overviewJourneyNextStep : undefined}
          value={t.syncDivergedTitle} hint={remoteHint}
          onSelect={onCheckTeamChanges} selectLabel={t.statusBarCheckNow} />
      );
      break;
    case "noRemote":
    case "noUpstream":
      publishStep = (
        <JourneyStep id="publish" tone="neutral" icon={<CloudCog />} label={t.overviewJourneyPublish}
          value={publish.state === "noRemote" ? t.overviewJourneyNoRemote : t.overviewJourneyNoUpstream}
          hint={publish.state === "noRemote" ? t.overviewJourneyNoRemoteHint : t.syncNoUpstreamMessage}
          onSelect={publish.state === "noRemote" ? onOpenProjectSettings : undefined}
          selectLabel={publish.state === "noRemote" ? t.projectSettingsOpen : undefined} />
      );
      break;
    case "detached":
    case "unborn":
      publishStep = (
        <JourneyStep id="publish" tone="muted" icon={<Cloud />} label={t.overviewJourneyPublish}
          value={publish.state === "detached" ? t.syncDetachedTitle : t.syncUnbornTitle}
          hint={publish.state === "detached" ? t.syncDetachedMessage : t.syncUnbornMessage} />
      );
      break;
  }

  // ---- The line under the band ----
  // The sentence says what the active step means. The action itself is the
  // active tile; the quieter link here is for states with somewhere to go
  // but nothing to press.
  let note: string;
  let noteAction: { label: string; onClick: () => void } | null = null;
  if (activeStep === "changes") {
    note = t.statusConflictsMessage(changes.conflicted);
  } else if (activeStep === "save") {
    note = t.overviewJourneyNoteSave;
  } else if (activeStep === "publish" && publish.state === "ahead") {
    note = t.syncAheadMessage;
    if (!canPublish) noteAction = { label: t.overviewHistoryViewAll, onClick: onOpenHistory };
  } else if (activeStep === "publish" && publish.state === "behind") {
    note = t.syncBehindMessage;
  } else if (activeStep === "publish" && publish.state === "diverged") {
    note = t.syncDivergedMessage;
  } else if (changes.state === "clean" && (publish.state === "noRemote" || publish.state === "noUpstream")) {
    note = t.overviewJourneyNoteNoRemote;
    noteAction = { label: t.projectSettingsOpen, onClick: onOpenProjectSettings };
  } else if (changes.state === "clean" && publish.state === "upToDate") {
    note = t.overviewJourneyNoteAllDone;
  } else if (changes.state === "error") {
    note = t.statusCouldntCheck;
    noteAction = { label: t.overviewCheckLocalAgain, onClick: onCheckLocalChanges };
  } else if (publish.inventoryError) {
    note = t.overviewPendingVersionsError;
    noteAction = { label: t.overviewCheckLocalAgain, onClick: onCheckLocalChanges };
  } else if (changes.state === "clean") {
    // Saved, and the remote side is the only thing left to say.
    switch (publish.state) {
      case "notChecked": note = t.syncNotCheckedMessage; break;
      case "checking": note = t.syncCheckingMessage; break;
      case "unavailable": note = publish.error ?? t.syncUnknownMessage; break;
      case "detached": note = t.syncDetachedMessage; break;
      case "unborn": note = t.syncUnbornMessage; break;
      default: note = t.overviewJourneyNoteAllDone;
    }
  } else {
    note = t.overviewJourneyNoteIdle;
  }

  return (
    <section className="journey" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">{t.overviewJourneyTitle}</h2>
      <ol className="journey__steps" aria-label={t.overviewJourneyTitle}>
        <li>{changesStep}</li>
        <li aria-hidden="true"><Connector isDone={changes.state === "clean" || changes.state === "dirty"} /></li>
        <li>{saveStep}</li>
        <li aria-hidden="true"><Connector isDone={save.state === "done"} /></li>
        <li>{publishStep}</li>
      </ol>
      <p className="journey__note" role="status">
        <Info aria-hidden="true" />
        <span>{note}</span>
        {noteAction && (
          <button className="journey__note-action" type="button" onClick={noteAction.onClick}>
            {noteAction.label}
            <ArrowRight aria-hidden="true" />
          </button>
        )}
        {publish.state !== "checking" && publish.state !== "detached" && publish.state !== "unborn" && (
          <button
            className="journey__refresh"
            type="button"
            disabled={publish.isChecking}
            onClick={onCheckTeamChanges}
            aria-label={publish.isChecking ? t.statusBarCheckingTeam : t.statusBarCheckNow}
            data-tooltip={publish.isChecking ? t.statusBarCheckingTeam : t.statusBarCheckNow}
          >
            <RotateCw className={publish.isChecking ? "icon--spinning" : undefined} aria-hidden="true" />
          </button>
        )}
      </p>
    </section>
  );
}
