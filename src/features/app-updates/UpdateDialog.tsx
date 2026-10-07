import React, { useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  ChevronDown,
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
import { Dialog, Mascot, ReleaseHighlights, ToolInstallationRow, autoHideScrollbarProps, useModalFocus, type ToolChip } from "../../shared/ui";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import type { StartupUpdateConfirmation, UpdateCandidate, UpdateError, UpdateHighlight, UpdateState } from "./domain";
import { appUpdateTranslations, candidateFromState } from "./translations";

/** The build the reader is running. It lives in the app shell's release
 * model, which a feature may not import, so the shell passes it in. */
export type InstalledRelease = Readonly<{ version: string }>;

/** One bundled release as the integrated What's new shows it: the entry shape
 * the app shell's release model owns, restated here because a feature may not
 * import that module. The shell maps `APP_CHANGELOG` into it. */
export type SettingsReleaseEntry = Readonly<{
  version: string;
  date: string | null;
  highlights: readonly UpdateHighlight[];
}>;

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

/* The codes whose sentence sends the reader to the manual download. Anywhere
   else the download page cannot help — it is unreachable offline, and it does
   nothing for an edit the reader still has to finish — so it is not offered:
   a dead end offers the way out, and only where there is one. */
const MANUAL_DOWNLOAD_CODES: ReadonlySet<UpdateError["code"]> = new Set([
  "http_status", "feed_unavailable", "target_unavailable", "automatic_update_not_enabled",
  "install_handoff_failed", "post_install_unconfirmed", "not_configured", "internal",
]);

/** The restarted app is not the version the installer was handed. It is
 * reported once at startup, as a failed state with its own code. */
function isUnconfirmedRestart(state: UpdateState): boolean {
  return state.kind === "failed" && state.error.code === "post_install_unconfirmed";
}

/** The native side sends an empty expected version when the handoff record
 * itself could not be read; the sentence then omits the unknown version. */
function unconfirmedMessage(confirmation: StartupUpdateConfirmation, language: Language): string {
  const t = appUpdateTranslations(language);
  const version = confirmation.kind === "unconfirmed" ? confirmation.expectedVersion.trim() : "";
  return version === "" ? t.startupUnconfirmedUnknown : t.startupUnconfirmed(version);
}

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

/** The cause the status line says in place of its verdict, if any: the cause
 * when the verdict alone (blocked, unavailable) would not say why, and the
 * adapter's safe detail whenever there is one. Never the same sentence twice.
 *
 * A specific cause replaces the generic sentence for its code: "The update
 * couldn't be completed" above "Update verification is not configured" said
 * one thing twice, the first time vaguely and under a verdict ("not
 * available") it contradicted. Only a blocked install keeps both — the
 * sentence says what to do, the detail names the work in the way. */
function describeDetail(state: UpdateState, language: Language): string[] {
  const t = appUpdateTranslations(language);
  const error = errorState(state);
  if (!error) return [];
  // An edit the reader left unfinished is named by its own feature, in the
  // reader's language, so it is the whole explanation.
  if (state.kind === "blocked" && error.blocker) return [t.installBlockedBy(error.blocker)];
  // The native side's safe detail is written in English. An English reader
  // gets it as the more specific cause; anyone else gets the sentence for
  // the code in their own language rather than a line in another one.
  const safeDetail = language === "en" ? error.safeDetail : null;
  if (safeDetail && state.kind !== "blocked") return [safeDetail];
  const lines: string[] = [];
  if (state.kind !== "failed") lines.push(t.errors[error.code]);
  if (safeDetail) lines.push(safeDetail);
  return lines;
}

/** The status, or its cause when it has one: a specific cause says what
 * happened better than the generic status, so it takes the status's place
 * rather than following it as a second sentence. */
function StatusLine({ line, cause = [], className = "" }: { line: StatusLine; cause?: string[]; className?: string }) {
  return (
    <p className={`status-line status-line--${line.tone} ${className}`.trim()} role="status" aria-live="polite" aria-atomic="true">
      {line.icon}
      <span>{cause.length > 0 ? cause.join(" ") : line.message}</span>
    </p>
  );
}

/* States whose status line says more than the Settings row's chip. */
const ROW_STATUS_STATES: ReadonlySet<UpdateState["kind"]> = new Set([
  "available", "blocked", "unavailable", "failed",
]);

/* The dialog has something the Settings row cannot say only once there is a
   release to read, a transfer to watch or an install to confirm. */
const DIALOG_STATES: ReadonlySet<UpdateState["kind"]> = new Set([
  "available", "downloading", "verifying", "ready", "blocked", "installing",
]);

function Progress({ state, language }: { state: UpdateState; language: Language }) {
  const t = appUpdateTranslations(language);
  if (state.kind === "verifying") {
    return (
      <div className="app-update-progress-group">
        <div className="app-update-progress app-update-progress--indeterminate" role="progressbar" aria-label={t.verifying}><span /></div>
        <span>{t.verifying}</span>
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
 * (version, date), then what it brings. A release whose feed
 * carries highlights shows them the way What's new does, in the reader's
 * language; one that carries none (every release before the field existed)
 * falls back to its notes as bounded plain text. */
function CandidateDetails({ candidate, language }: { candidate: UpdateCandidate; language: Language }) {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const publishedAt = formatPublishedAt(candidate.publishedAt, formats);
  return (
    <section className="app-update-candidate" aria-labelledby="app-update-candidate-title">
      <div className="app-update-candidate__identity">
        <h3 id="app-update-candidate-title">{candidate.version}</h3>
        {publishedAt && candidate.publishedAt && (
          <time className="app-update-candidate__date" dateTime={candidate.publishedAt}>{publishedAt}</time>
        )}
      </div>
      {candidate.highlights.length > 0 ? (
        <>
          <p className="app-update-candidate__notes-label">{t.highlights}</p>
          <ReleaseHighlights highlights={candidate.highlights} language={language} />
        </>
      ) : (
        <>
          <p className="app-update-candidate__notes-label">{t.releaseNotes}</p>
          <p className="app-update-notes">{candidate.notes.trim() || t.noNotes}</p>
        </>
      )}
    </section>
  );
}

/** The chip's short state word, so the row answers "what is this?" at a glance
 * while the status line below says it in full. */
function describeChip(state: UpdateState, language: Language): ToolChip {
  const t = appUpdateTranslations(language);
  const spinner = <LoaderCircle aria-hidden="true" className="icon--spinning" />;
  switch (state.kind) {
    case "idle": return { label: t.chip.idle, tone: "neutral" };
    case "checking": return { label: t.chip.checking, tone: "neutral", icon: spinner };
    case "current": return { label: t.chip.current, tone: "success", icon: <CheckCircle2 aria-hidden="true" /> };
    case "available": return { label: t.chip.available, tone: "accent", icon: <CircleArrowUp aria-hidden="true" /> };
    case "downloading": return { label: t.chip.downloading, tone: "neutral", icon: spinner };
    case "verifying": return { label: t.chip.verifying, tone: "neutral", icon: spinner };
    case "ready": return { label: t.chip.ready, tone: "accent", icon: <ShieldCheck aria-hidden="true" /> };
    case "blocked": return { label: t.chip.blocked, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> };
    case "installing": return { label: t.chip.installing, tone: "neutral", icon: spinner };
    case "cancelled": return { label: t.chip.cancelled, tone: "neutral" };
    case "unavailable": return { label: t.chip.unavailable, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> };
    case "failed": return { label: t.chip.failed, tone: "danger", icon: <CircleAlert aria-hidden="true" /> };
  }
}

/** One bundled release's publication day, formatted for the reader, or null
 * for an unreadable date. A candidate carries a full ISO instant; a bundled
 * entry carries a `YYYY-MM-DD` day, which is parsed as local midnight the way
 * the changelog parses it, so it cannot slip a day backwards. */
function formatReleaseDate(value: string | null, formats: LocaleFormats): string | null {
  if (value === null) return null;
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed, formats);
}

function ReleaseBadge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="whatsnew-badge">{children}</span>;
}

/** An earlier release: one compact line that opens onto its notes on request.
 * The running build is marked in the list because it is the one entry the
 * reader can place themselves against. */
function EarlierRelease({
  release,
  isInstalled,
  language,
}: {
  release: SettingsReleaseEntry;
  isInstalled: boolean;
  language: Language;
}): React.JSX.Element {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const [isExpanded, setIsExpanded] = useState(false);
  const notesId = useId();
  const releaseDate = formatReleaseDate(release.date, formats);

  return (
    <li className="whatsnew-entry">
      <button
        className="whatsnew-entry__trigger"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={notesId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span className="whatsnew-entry__heading">
          <span className="whatsnew-entry__chevron" aria-hidden="true"><ChevronDown /></span>
          <span className="whatsnew-entry__identity">
            <h4>{release.version}</h4>
            {isInstalled
              ? <ReleaseBadge>{t.whatsNewYourVersion}</ReleaseBadge>
              : release.highlights.length > 0 && (
                <span className="whatsnew-entry__count">{t.whatsNewHighlightCount(release.highlights.length)}</span>
              )}
          </span>
          {releaseDate && release.date && (
            <time className="whatsnew-entry__date" dateTime={release.date}>{releaseDate}</time>
          )}
        </span>
      </button>
      {isExpanded && (release.highlights.length === 0
        ? <p id={notesId} className="whatsnew-empty">{t.whatsNewEmpty}</p>
        : <ReleaseHighlights id={notesId} highlights={release.highlights} language={language} />)}
    </li>
  );
}

/** The integrated What's new: the release the reader is offered (when the feed
 * describes one) or the build they run, then every earlier version as a
 * disclosure. It shows what the changelog dialog shows, in place, so the
 * Updates section answers "what changed?" without a second surface. */
function WhatsNewSection({
  releases,
  installed,
  candidate,
  language,
}: {
  releases: readonly SettingsReleaseEntry[];
  installed: InstalledRelease;
  candidate: UpdateCandidate | null;
  language: Language;
}): React.JSX.Element | null {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const current = releases.find((release) => release.version === installed.version) ?? releases[0];
  if (!current) return null;
  /* The offered release leads when the feed describes it; a candidate with no
     highlights leaves the running build as the thing to read. */
  const offered: SettingsReleaseEntry | null =
    candidate && candidate.highlights.length > 0
      ? { version: candidate.version, date: candidate.publishedAt, highlights: candidate.highlights }
      : null;
  const featured = offered ?? current;
  const earlier = releases.filter((release) => release.version !== featured.version);
  const featuredDate = formatReleaseDate(featured.date, formats);

  return (
    <section className="settings-group" aria-labelledby="app-whats-new-title">
      <header className="settings-group__header">
        <h3 id="app-whats-new-title">{t.highlights}</h3>
        <p>{t.whatsNewDescription}</p>
      </header>
      <article className="whatsnew-release">
        <div className="whatsnew-release__identity">
          <h3>{featured.version}</h3>
          {offered ? <ReleaseBadge>{t.whatsNewNewBadge}</ReleaseBadge> : <ReleaseBadge>{t.whatsNewYourVersion}</ReleaseBadge>}
          {featuredDate && featured.date && (
            <time className="whatsnew-release__date" dateTime={featured.date}>{featuredDate}</time>
          )}
        </div>
        {featured.highlights.length > 0
          ? <ReleaseHighlights highlights={featured.highlights} language={language} />
          : <p className="whatsnew-empty">{t.whatsNewEmpty}</p>}
      </article>
      {earlier.length > 0 && (
        <div className="whatsnew-earlier">
          <h4 className="whatsnew-earlier__heading">{t.whatsNewEarlierHeading}</h4>
          <ol className="whatsnew-list" role="list">
            {earlier.map((release) => (
              <EarlierRelease
                key={release.version}
                release={release}
                isInstalled={release.version === installed.version}
                language={language}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** The Updates section of Settings: the installed build with its status and
 * actions, the manual download as its own way out, the integrated What's new,
 * then the one switch for the startup check — with the disclosure (GitHub, the
 * 24-hour repeat for long sessions, what is sent) beside it, as DESIGN.md
 * requires. Checking is never started from here on mount; only the button and
 * the switch act. */
export function AppUpdateSettingsControl({
  snapshot,
  controller,
  installed,
  name,
  enabled,
  setEnabled,
  onOpenDialog,
  releases,
}: {
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  installed: InstalledRelease;
  /** The product name for the row's identity line; the shell owns it. */
  name: string;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  onOpenDialog?: () => void;
  /** The bundled changelog, newest first. The shell owns the release model and
   * passes it in; without it the What's new group stays out. */
  releases?: readonly SettingsReleaseEntry[];
}) {
  const { language } = useLanguage();
  const t = appUpdateTranslations(language);
  const state = snapshot.state;
  const candidate = candidateFromState(state);
  const line = describeState(state, language);
  const detail = describeDetail(state, language);
  /* Details opens the dialog, where the notes, the progress and the install
     confirmation live. The cause of a failure is already in the row, so it is
     offered only when the dialog has something the row does not. */
  const hasDetails = onOpenDialog !== undefined && DIALOG_STATES.has(state.kind);
  /* One contextual primary: the state's next step, always in the same place.
     "Download" starts the transfer and opens the dialog, so the progress and
     the cancel stay reachable. While a transfer or install runs, "Details"
     reopens that dialog without starting another operation. Without a dialog
     host, the busy state stays disabled. */
  const primary =
    state.kind === "checking"
      ? { label: t.chip.checking, disabled: true, run: () => undefined, spinner: true }
      : state.kind === "available"
        ? { label: t.download, disabled: false, run: () => { onOpenDialog?.(); void controller.download(); }, spinner: false }
        : hasDetails
          ? { label: t.details, disabled: false, run: onOpenDialog, spinner: false }
          : state.kind === "downloading" || state.kind === "verifying" || state.kind === "installing"
            ? { label: t.chip[state.kind], disabled: true, run: () => undefined, spinner: true }
            : { label: t.check, disabled: false, run: () => void controller.check(), spinner: false };
  /* The build you have, the manual way out, what changed, and how the next one
     reaches you — none named after the tab it sits in. */
  return (
    <div className="settings-groups">
      <section className="settings-group">
        <div className="settings-group__body">
          <ToolInstallationRow
            mark={<Mascot variant="head" />}
            name={name}
            chip={describeChip(state, language)}
            version={installed.version}
            versionLabel={t.installedLabel}
            /* The chip already names a settled state; the line speaks only
               when it adds something: the offered release, a cause or a failure. */
            status={detail.length > 0 || ROW_STATUS_STATES.has(state.kind) ? <StatusLine line={line} cause={detail} /> : null}
            primaryAction={
              <button className="primary-button" type="button" disabled={primary.disabled} onClick={primary.run}>
                {primary.spinner && <LoaderCircle aria-hidden="true" className="icon--spinning" />}
                {primary.label}
              </button>
            }
          />
        </div>
      </section>
      <section className="settings-group">
        <header className="settings-group__header">
          <h3>{t.otherWaysTitle}</h3>
          <p>{t.otherWaysDescription}</p>
        </header>
        <div className="settings-group__body">
          <div className="settings-row">
            <div><strong>{t.manual}</strong><p>{t.manualDownloadDescription}</p></div>
            <div className="settings-row__actions">
              <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}>
                <ExternalLink aria-hidden="true" />
                {t.openReleases}
              </button>
            </div>
          </div>
        </div>
      </section>
      {releases && releases.length > 0 && (
        <WhatsNewSection releases={releases} installed={installed} candidate={candidate} language={language} />
      )}
      <section className="settings-group">
        <header className="settings-group__header"><h3>{t.receivingTitle}</h3></header>
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
 * release, progress, or what installing will do.
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
  const descriptionId = useId();
  useModalFocus(isOpen, dialogRef, setOpen);

  if (!isOpen) return null;
  const state = snapshot.state;
  const candidate = candidateFromState(state);
  const error = errorState(state);
  const unconfirmed = isUnconfirmedRestart(state);
  /* A restart on the wrong version is one sentence: the startup receipt and
     the failure say the same thing, so only the receipt is drawn. */
  const line: StatusLine = unconfirmed
    ? { tone: "warning", icon: <CircleAlert aria-hidden="true" />, message: unconfirmedMessage(snapshot.startupConfirmation, language) }
    : describeState(state, language);
  const detail = unconfirmed ? [] : describeDetail(state, language);
  const offersManual = error !== null && MANUAL_DOWNLOAD_CODES.has(error.code);
  const canRetry = !unconfirmed && (error?.retryable || state.kind === "cancelled");
  const cancelOperation = state.kind === "checking" || state.kind === "downloading";
  const downloadLabel = candidate?.expectedBytes
    ? t.downloadSized(formatBytes(candidate.expectedBytes, language))
    : t.download;
  const close = () => setOpen(false);

  const version = candidate ? candidate.version : null;
  /* The title is the state, so the reader knows what this is about before
     reading further; the status line only says what the title does not. */
  const title = state.kind === "available" ? t.titleAvailable
    : state.kind === "downloading" && version ? t.titleDownloading(version)
      : state.kind === "verifying" && version ? t.titleVerifying(version)
        : state.kind === "ready" ? t.titleReady
          : state.kind === "current" ? t.titleCurrent
            : state.kind === "installing" ? t.titleInstalling
              : state.kind === "blocked" && state.error.code === "install_blocked" ? t.titleBlocked
                : unconfirmed ? t.titleUnconfirmed
                  : t.title;
  const titleSaysState = state.kind === "available" || state.kind === "ready" || state.kind === "current"
    || ((state.kind === "downloading" || state.kind === "verifying") && Boolean(version));

  return (
    <Dialog
      size="m"
      title={title}
      titleId="app-update-title"
      subtitle={
        <span className="app-update-dialog__installed" aria-label={`${t.installedLabel} ${installed.version}`}>
          {t.installedSubtitle(installed.version)}
        </span>
      }
      descriptionId={descriptionId}
      icon={<CloudDownload />}
      onClose={close}
      closeLabel={appT.commonClose}
      dialogRef={dialogRef}
      className="app-update-dialog auto-hide-scrollbar"
      bodyProps={autoHideScrollbarProps<HTMLDivElement>()}
    >
      <div id={descriptionId} className="app-update-dialog__state">
        {/* Ready is the install confirmation: what installing does, said
            before the one button that does it. */}
        {state.kind === "ready"
          ? <p className="app-dialog__text">{t.installExplanation}</p>
          : (!titleSaysState || detail.length > 0) && <StatusLine line={line} cause={detail} />}
      </div>
      {candidate && <CandidateDetails candidate={candidate} language={language} />}
      <Progress state={state} language={language} />
      <div className="dialog-actions app-update-actions">
        {offersManual && <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}><ExternalLink aria-hidden="true" />{t.manual}</button>}
        {cancelOperation && <button className="secondary-button" type="button" onClick={() => void controller.cancel()}>{t.cancel}</button>}
        {(state.kind === "available" || state.kind === "ready") && <button className="secondary-button" type="button" onClick={close}>{t.notNow}</button>}
        {state.kind === "current" && <button className="secondary-button" type="button" onClick={() => void controller.check()}><RotateCw aria-hidden="true" />{t.checkAgain}</button>}
        {state.kind === "current" && <button className="primary-button" type="button" onClick={close}>{t.close}</button>}
        {state.kind === "idle" && <button className="primary-button" type="button" onClick={() => void controller.check()}><RotateCw aria-hidden="true" />{t.check}</button>}
        {unconfirmed && <button className="primary-button" type="button" onClick={() => void controller.check()}><RotateCw aria-hidden="true" />{t.checkAgain}</button>}
        {state.kind === "available" && <button className="primary-button" type="button" onClick={() => void controller.download()}><Download aria-hidden="true" />{downloadLabel}</button>}
        {state.kind === "ready" && <button className="primary-button" type="button" onClick={() => void controller.install()}>{t.install}</button>}
        {canRetry && <button className="primary-button" type="button" onClick={() => void (state.kind === "blocked" ? controller.install() : controller.check())}>{t.retry}</button>}
      </div>
    </Dialog>
  );
}
