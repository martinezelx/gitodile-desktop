import React, { useEffect, useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleArrowUp,
  CloudDownload,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Language } from "../../i18n";
import { formatDate, type LocaleFormats } from "../../shared/i18n";
import { ChannelGlyph, DialogCloseButton, autoHideScrollbarProps, moveFocusWithinRadioGroup, useModalFocus } from "../../shared/ui";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import type { UpdateCandidate, UpdateChannel, UpdateError, UpdateState } from "./domain";
import { appUpdateTranslations, candidateFromState } from "./translations";

/** The build the reader is running. It lives in the app shell's release
 * model, which a feature may not import, so the shell passes it in. */
export type InstalledRelease = Readonly<{ version: string; channel: UpdateChannel }>;

function formatBytes(value: number, language: string): string {
  return new Intl.NumberFormat(language, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    .format(value / 1_048_576);
}

function errorState(state: UpdateState): UpdateError | null {
  return "error" in state ? state.error : null;
}

/** ISO from the manifest, formatted like the changelog does, or nothing: a
 * date the app cannot read is left out rather than shown as "Invalid Date". */
function formatPublishedAt(publishedAt: string | null, formats: LocaleFormats): string | null {
  if (publishedAt === null) return null;
  const parsed = new Date(publishedAt);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed, formats);
}

type StatusTone = "neutral" | "progress" | "success" | "accent" | "warning" | "danger";
type StatusLine = { tone: StatusTone; icon: React.JSX.Element; message: string };

const BUSY_STATES: ReadonlySet<UpdateState["kind"]> = new Set(["checking", "downloading", "verifying", "installing"]);

/** One line per state, in a tone the reader can take in before the words: the
 * same scale the Git installation row uses, so "up to date" looks the same
 * whether it is about Git or about the app.
 *
 * A failure *is* its explanation. The line used to say "The update could not
 * be completed." and a box under it said the same thing again with the cause
 * appended; now the cause is the line. */
function describeState(state: UpdateState, language: Language): StatusLine {
  const t = appUpdateTranslations(language);
  const spinner = <LoaderCircle aria-hidden="true" className="icon--spinning" />;
  switch (state.kind) {
    case "idle": return { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.status.idle };
    case "checking": return { tone: "progress", icon: spinner, message: t.checking };
    case "current": return { tone: "success", icon: <CheckCircle2 aria-hidden="true" />, message: t.current };
    case "available": return { tone: "accent", icon: <CircleArrowUp aria-hidden="true" />, message: t.available(state.candidate.version) };
    case "downloading": return { tone: "progress", icon: spinner, message: t.downloading };
    case "verifying": return { tone: "progress", icon: spinner, message: t.verifying };
    case "ready": return { tone: "success", icon: <ShieldCheck aria-hidden="true" />, message: t.ready };
    case "blocked": return { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.status.blocked };
    case "installing": return { tone: "progress", icon: spinner, message: t.installing };
    case "cancelled": return { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.cancelled };
    case "unavailable": return { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.status.unavailable };
    case "failed": return { tone: "danger", icon: <CircleAlert aria-hidden="true" />, message: t.errors[state.error.code] };
  }
}

/** What goes under the status line, if anything: the cause when the line
 * itself is only a verdict (blocked, unavailable), and the adapter's safe
 * detail — the name of the work that blocks an install, say — whenever there
 * is one. Never the same sentence twice. */
function describeDetail(state: UpdateState, language: Language): string[] {
  const t = appUpdateTranslations(language);
  const error = errorState(state);
  if (!error) return [];
  const lines: string[] = [];
  if (state.kind !== "failed") lines.push(t.errors[error.code]);
  if (error.safeDetail) lines.push(error.safeDetail);
  return lines;
}

function StatusLine({ line, className = "" }: { line: StatusLine; className?: string }) {
  return (
    <p className={`status-line status-line--${line.tone} ${className}`.trim()} role="status" aria-live="polite" aria-atomic="true">
      {line.icon}
      <span>{line.message}</span>
    </p>
  );
}

/** The installed build, the way About and the changelog show it: version in
 * the label weight, the preview glyph only when it is not stable. */
function InstalledLine({ installed, language }: { installed: InstalledRelease; language: Language }) {
  const t = appUpdateTranslations(language);
  return (
    <p className="about-dialog__release app-update-dialog__installed" aria-label={`${t.installedLabel} ${installed.version} ${installed.channel}`}>
      <span className="app-update-dialog__installed-label">{t.installedLabel}</span>
      <span className="about-dialog__release-version">v{installed.version}</span>
      <ChannelGlyph channel={installed.channel} />
    </p>
  );
}

function Progress({ state, language }: { state: UpdateState; language: Language }) {
  const t = appUpdateTranslations(language);
  if (state.kind === "verifying") {
    return (
      <div className="app-update-progress app-update-progress--indeterminate" role="progressbar" aria-label={t.verifying}>
        <span />
      </div>
    );
  }
  if (state.kind !== "downloading") return null;
  const received = formatBytes(state.transfer.receivedBytes, language);
  if (state.transfer.length === "unknown") {
    return (
      <div className="app-update-progress-group">
        <div className="app-update-progress app-update-progress--indeterminate" role="progressbar" aria-label={t.received(received)}><span /></div>
        <span>{t.received(received)}</span>
      </div>
    );
  }
  const percent = Math.min(100, (state.transfer.receivedBytes / state.transfer.totalBytes) * 100);
  const total = formatBytes(state.transfer.totalBytes, language);
  return (
    <div className="app-update-progress-group">
      <div className="app-update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={t.progress(received, total)}>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <span>{t.progress(received, total)}</span>
    </div>
  );
}

/** The offered release as a card: identity row in the changelog's vocabulary
 * (version, preview glyph, date), then its notes as bounded plain text. */
function CandidateDetails({ candidate, language }: { candidate: UpdateCandidate; language: Language }) {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const publishedAt = formatPublishedAt(candidate.publishedAt, formats);
  return (
    <section className="app-update-candidate" aria-labelledby="app-update-candidate-title">
      <div className="app-update-candidate__identity">
        <h3 id="app-update-candidate-title">v{candidate.version}</h3>
        <ChannelGlyph channel={candidate.channel} />
        {publishedAt && candidate.publishedAt && (
          <time className="app-update-candidate__date" dateTime={candidate.publishedAt}>{publishedAt}</time>
        )}
      </div>
      <p className="app-update-candidate__notes-label">{t.releaseNotes}</p>
      <p className="app-update-notes">{candidate.notes.trim() || t.noNotes}</p>
    </section>
  );
}

const CHANNEL_OPTIONS: readonly UpdateChannel[] = ["stable", "preview"];

/** Which feed to follow, as a two-option group under the installed build.
 * It shows the channel a check will actually use — a build that has never
 * been told otherwise reads as its own channel, not as a third "default"
 * option — and one sentence per option says what choosing it means.
 *
 * Choosing the other option is not yet a change: it opens a confirmation
 * card (the install confirmation's shape) that says what following that
 * channel means and, the part every good channel switch states, that the
 * installed version stays put — the app never downgrades, so going back to
 * Stable means waiting for the next stable. Only confirming stores the
 * choice; native memory then forgets whatever the old feed offered and a
 * check of the new channel starts at once. */
function ChannelControl({
  snapshot,
  controller,
  busy,
  language,
}: {
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  busy: boolean;
  language: Language;
}) {
  const t = appUpdateTranslations(language);
  const setting = snapshot.channel;
  const [pending, setPending] = useState<UpdateChannel | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (pending) confirmButtonRef.current?.focus();
  }, [pending]);
  // A change that settles elsewhere (busy again, or the channel it asked
  // for already in force) leaves nothing to confirm.
  useEffect(() => {
    if (busy || setting === null || setting.channel === pending) setPending(null);
  }, [busy, setting, pending]);
  const confirm = pending ? t.channelConfirm[pending] : null;
  return (
    <>
      <div className="settings-row">
        <div>
          <strong>{t.channelLabel}</strong>
          <p>{t.channelStableDescription} {t.channelPreviewDescription}</p>
        </div>
        <div
          className="segmented-control"
          role="radiogroup"
          aria-label={t.channelLabel}
          onKeyDown={moveFocusWithinRadioGroup}
        >
          {CHANNEL_OPTIONS.map((option, index) => {
            const isActive = setting?.channel === option;
            return (
              <button
                key={option}
                className={`segmented-control__option${isActive ? " segmented-control__option--active" : ""}`}
                type="button"
                role="radio"
                aria-checked={isActive}
                disabled={busy || setting === null}
                tabIndex={(setting ? isActive : index === 0) ? 0 : -1}
                onClick={() => setPending(isActive ? null : option)}
              >
                {t.channel[option]}
              </button>
            );
          })}
        </div>
      </div>
      {pending && confirm && (
        <div className="settings-row settings-row--stacked">
          <div
            className="app-update-confirm app-update-confirm--channel"
            role="group"
            aria-labelledby={titleId}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setPending(null);
              }
            }}
          >
            <h3 id={titleId}>{confirm.title}</h3>
            <p>{confirm.explanation}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPending(null)}>{t.notNow}</button>
              <button
                ref={confirmButtonRef}
                className="primary-button"
                type="button"
                onClick={() => {
                  setPending(null);
                  void controller.setChannel(pending);
                }}
              >
                {confirm.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The Updates section of Settings: the installed build with its status and
 * actions, the channel to follow, then the one switch for the startup check
 * — with the disclosure (GitHub, the 24-hour repeat for long sessions, what
 * is sent) beside it, as DESIGN.md requires. Checking is never started from
 * here on mount; only the button and the switch act. */
export function AppUpdateSettingsControl({
  snapshot,
  controller,
  installed,
  enabled,
  setEnabled,
  onOpenDialog,
}: {
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  installed: InstalledRelease;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  onOpenDialog?: () => void;
}) {
  const { language } = useLanguage();
  const t = appUpdateTranslations(language);
  const state = snapshot.state;
  const busy = BUSY_STATES.has(state.kind);
  const line = describeState(state, language);
  /* "Details" opens the dialog, where the notes, the progress and the install
     confirmation live. It is offered only when there is something to see
     there that this row does not already say. */
  const hasDetails = onOpenDialog && !["idle", "checking", "current"].includes(state.kind);
  return (
    <div className="settings-groups">
      <section className="settings-group">
        <header className="settings-group__header"><h3>{t.title}</h3></header>
        <div className="settings-group__body">
          <div className="settings-row">
            <div className="app-update-settings__identity">
              <p className="version-line">
                <span className="version-line__label">{t.installedLabel}</span>
                <span className="version-line__value">v{installed.version}</span>
                <ChannelGlyph channel={installed.channel} />
              </p>
              <StatusLine line={line} />
            </div>
            <div className="settings-row__actions">
              {hasDetails && (
                <button className="secondary-button" type="button" onClick={onOpenDialog}>{t.details}</button>
              )}
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void controller.check()}>
                {state.kind === "checking" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
                {t.check}
              </button>
            </div>
          </div>
          <ChannelControl snapshot={snapshot} controller={controller} busy={busy} language={language} />
        </div>
      </section>
      <section className="settings-group">
        <header className="settings-group__header"><h3>{t.automaticTitle}</h3></header>
        <div className="settings-group__body">
          <div className="settings-row">
            <div><strong>{t.automaticLabel}</strong><p>{t.automaticDescription}</p></div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t.automaticLabel}
              className={`toggle-switch${enabled ? " toggle-switch--on" : ""}`}
              onClick={() => setEnabled(!enabled)}
            ><span className="toggle-switch__knob" aria-hidden="true" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The update dialog, on the About shell like the changelog: mark, title, the
 * installed build, then one status line whose tone carries the state, and
 * only under it whatever that state has to show — a cause, the offered
 * release, progress, or the install confirmation.
 */
export function AppUpdateDialog({
  isOpen,
  setOpen,
  snapshot,
  controller,
  installed,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  installed: InstalledRelease;
}) {
  const { language, t: appT } = useLanguage();
  const t = appUpdateTranslations(language);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [confirmingInstall, setConfirmingInstall] = useState(false);
  const descriptionId = useId();
  useModalFocus(isOpen, dialogRef, setOpen);

  useEffect(() => {
    if (!isOpen) setConfirmingInstall(false);
  }, [isOpen]);
  useEffect(() => {
    if (confirmingInstall) confirmButtonRef.current?.focus();
  }, [confirmingInstall]);

  if (!isOpen) return null;
  const state = snapshot.state;
  const candidate = candidateFromState(state);
  const error = errorState(state);
  const line = describeState(state, language);
  const detail = describeDetail(state, language);
  const canRetry = error?.retryable || state.kind === "cancelled";
  const cancelOperation = state.kind === "checking" || state.kind === "downloading";
  const startup: StatusLine | null = snapshot.startupConfirmation.kind === "confirmed"
    ? { tone: "success", icon: <CheckCircle2 aria-hidden="true" />, message: t.startupConfirmed(snapshot.startupConfirmation.version) }
    : snapshot.startupConfirmation.kind === "unconfirmed"
      ? { tone: "warning", icon: <CircleAlert aria-hidden="true" />, message: t.startupUnconfirmed(snapshot.startupConfirmation.expectedVersion) }
      : null;
  const downloadLabel = candidate?.expectedBytes
    ? t.downloadSized(formatBytes(candidate.expectedBytes, language))
    : t.download;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={dialogRef} className="about-dialog app-update-dialog auto-hide-scrollbar" role="dialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby={descriptionId} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <DialogCloseButton label={appT.commonClose} onClick={() => setOpen(false)} />
        <div className="app-update-dialog__mark" aria-hidden="true"><CloudDownload /></div>
        <h2 id="app-update-title">{t.title}</h2>
        <InstalledLine installed={installed} language={language} />
        <div id={descriptionId} className="app-update-dialog__state">
          {startup && <StatusLine line={startup} />}
          <StatusLine line={line} />
          {detail.length > 0 && (
            <div className="app-update-detail">
              {detail.map((text) => <p key={text}>{text}</p>)}
            </div>
          )}
        </div>
        {candidate && <CandidateDetails candidate={candidate} language={language} />}
        <Progress state={state} language={language} />
        {confirmingInstall && state.kind === "ready" && (
          <div className="app-update-confirm" role="group" aria-labelledby="app-update-confirm-title">
            <h3 id="app-update-confirm-title">{t.confirmTitle}</h3>
            <p>{t.installExplanation}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmingInstall(false)}>{t.notNow}</button>
              <button ref={confirmButtonRef} className="primary-button" type="button" onClick={() => void controller.install()}>{t.install}</button>
            </div>
          </div>
        )}
        {!confirmingInstall && (
          <div className="dialog-actions app-update-actions">
            {(error || state.kind === "unavailable") && <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}><ExternalLink aria-hidden="true" />{t.manual}</button>}
            {cancelOperation && <button className="secondary-button" type="button" onClick={() => void controller.cancel()}>{t.cancel}</button>}
            {(state.kind === "idle" || state.kind === "current") && <button className="primary-button" type="button" onClick={() => void controller.check()}><RotateCw aria-hidden="true" />{t.check}</button>}
            {state.kind === "available" && <button className="primary-button" type="button" onClick={() => void controller.download()}><Download aria-hidden="true" />{downloadLabel}</button>}
            {state.kind === "ready" && <button className="primary-button" type="button" onClick={() => setConfirmingInstall(true)}>{t.reviewInstall}</button>}
            {canRetry && <button className="primary-button" type="button" onClick={() => void (state.kind === "blocked" ? controller.install() : controller.check())}>{t.retry}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
