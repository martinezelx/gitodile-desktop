import React, { useEffect, useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  Download,
  ExternalLink,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useModalFocus } from "../../shared/ui";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import type { UpdateCandidate, UpdateError, UpdateState } from "./domain";
import { appUpdateTranslations, candidateFromState } from "./translations";

function formatBytes(value: number, language: string): string {
  return new Intl.NumberFormat(language, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    .format(value / 1_048_576);
}

function errorState(state: UpdateState): UpdateError | null {
  return "error" in state ? state.error : null;
}

function statusText(state: UpdateState, language: "en" | "es"): string {
  const t = appUpdateTranslations(language);
  switch (state.kind) {
    case "idle": return t.status.idle;
    case "checking": return t.checking;
    case "current": return t.current;
    case "available": return t.available(state.candidate.version);
    case "downloading": return t.downloading;
    case "verifying": return t.verifying;
    case "ready": return t.ready;
    case "blocked": return t.status.blocked;
    case "installing": return t.installing;
    case "cancelled": return t.cancelled;
    case "unavailable": return t.status.unavailable;
    case "failed": return t.status.failed;
  }
}

function Progress({ state, language }: { state: UpdateState; language: "en" | "es" }) {
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
        <span style={{ inlineSize: `${percent}%` }} />
      </div>
      <span>{t.progress(received, total)}</span>
    </div>
  );
}

function CandidateDetails({ candidate, language }: { candidate: UpdateCandidate; language: "en" | "es" }) {
  const t = appUpdateTranslations(language);
  return (
    <div className="app-update-candidate">
      <div className="app-update-candidate__identity">
        <strong>v{candidate.version}</strong>
        <span>{t.channel}: {candidate.channel}</span>
      </div>
      <section aria-labelledby="app-update-notes-title">
        <h3 id="app-update-notes-title">{t.releaseNotes}</h3>
        <p className="app-update-notes">{candidate.notes.trim() || t.noNotes}</p>
      </section>
    </div>
  );
}

export function AppUpdateSettingsControl({
  snapshot,
  controller,
  enabled,
  setEnabled,
  onOpenDialog,
}: {
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  onOpenDialog?: () => void;
}) {
  const { language } = useLanguage();
  const t = appUpdateTranslations(language);
  const busy = ["checking", "downloading", "verifying", "installing"].includes(snapshot.state.kind);
  return (
    <section className="settings-group app-update-settings">
      <header className="settings-group__header"><h3>{t.title}</h3></header>
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
        <div className="settings-row">
          <div role="status" aria-live="polite"><strong>{statusText(snapshot.state, language)}</strong></div>
          <div className="app-update-settings__actions">
            {snapshot.state.kind !== "idle" && snapshot.state.kind !== "checking" && snapshot.state.kind !== "current" && onOpenDialog && (
              <button className="secondary-button" type="button" onClick={onOpenDialog}>{t.details}</button>
            )}
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void controller.check()}>
              {snapshot.state.kind === "checking" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
              {snapshot.state.kind === "checking" ? t.checking : t.check}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AppUpdateDialog({
  isOpen,
  setOpen,
  snapshot,
  controller,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
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
  const canRetry = error?.retryable || state.kind === "cancelled";
  const cancelOperation = state.kind === "checking" || state.kind === "downloading";
  const startupMessage = snapshot.startupConfirmation.kind === "confirmed"
    ? t.startupConfirmed(snapshot.startupConfirmation.version)
    : snapshot.startupConfirmation.kind === "unconfirmed"
      ? t.startupUnconfirmed(snapshot.startupConfirmation.expectedVersion)
      : null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div ref={dialogRef} className="about-dialog app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby={descriptionId} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <button className="about-dialog__close" type="button" aria-label={appT.commonClose} onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
        <div className="app-update-dialog__mark" aria-hidden="true"><CloudDownload /></div>
        <h2 id="app-update-title">{t.title}</h2>
        <p id={descriptionId}>{t.description}</p>
        {startupMessage && <p className={`app-update-message app-update-message--${snapshot.startupConfirmation.kind}`} role="status">
          {snapshot.startupConfirmation.kind === "confirmed" ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          {startupMessage}
        </p>}
        <div className="app-update-status" aria-live="polite" aria-atomic="true">
          {state.kind === "ready" ? <ShieldCheck aria-hidden="true" /> : error ? <CircleAlert aria-hidden="true" /> : ["checking", "downloading", "verifying", "installing"].includes(state.kind) ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <Download aria-hidden="true" />}
          <strong>{statusText(state, language)}</strong>
        </div>
        {error && (
          <div className="app-update-error">
            <p>{t.errors[error.code]}</p>
            {error.safeDetail && <p className="app-update-error__detail">{error.safeDetail}</p>}
          </div>
        )}
        {candidate && <CandidateDetails candidate={candidate} language={language} />}
        <Progress state={state} language={language} />
        {confirmingInstall && state.kind === "ready" && (
          <div className="app-update-confirm" role="group" aria-labelledby="app-update-confirm-title">
            <h3 id="app-update-confirm-title">{t.reviewInstall}</h3>
            <p>{t.installExplanation}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmingInstall(false)}>{t.notNow}</button>
              <button ref={confirmButtonRef} className="primary-button" type="button" onClick={() => void controller.install()}>{t.install}</button>
            </div>
          </div>
        )}
        {!confirmingInstall && (
          <div className="dialog-actions app-update-actions">
            {(state.kind === "idle" || state.kind === "current") && <button className="primary-button" type="button" onClick={() => void controller.check()}>{t.check}</button>}
            {state.kind === "available" && <button className="primary-button" type="button" onClick={() => void controller.download()}><Download aria-hidden="true" />{t.download}</button>}
            {state.kind === "ready" && <button className="primary-button" type="button" onClick={() => setConfirmingInstall(true)}>{t.reviewInstall}</button>}
            {cancelOperation && <button className="secondary-button" type="button" onClick={() => void controller.cancel()}>{t.cancel}</button>}
            {canRetry && <button className="primary-button" type="button" onClick={() => void (state.kind === "blocked" ? controller.install() : controller.check())}>{t.retry}</button>}
            {(error || state.kind === "unavailable") && <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}><ExternalLink aria-hidden="true" />{t.manual}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
