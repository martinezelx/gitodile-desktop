import React, { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import type { VersionLinesSnapshot } from "./domain";
import { checkLineName } from "./lineNames";
import type { VersionLinesPort } from "./port";
import { versionLinesPort } from "./tauriAdapter";
import { prefersReducedMotion } from "./VersionLineRoute";

/** How long the strip takes to give the name back on Cancel — the same fade
 * it came in with, so the edit closes the way it opened. */
const LEAVE_MS = 140;

/** The detail strip while its line is being renamed: the name itself becomes
 * editable where it stands — the same type, size and place, with a straight
 * accent line under it to say it now takes typing — the byline under it
 * fades into what the rename will and will not change (or why Git would
 * refuse the name), and Switch, Rename and Delete give their place to two
 * circles, Cancel and Rename. Nothing on the strip moves or changes typeface,
 * and the confirming circle is not a second accent fill on the screen.
 *
 * A rename is a local mutation that moves no saved version and no file, which
 * is why it no longer needs a modal: the dialog it replaces was a title, this
 * same field and two notes, over the screen that already shows the line. It
 * is built the way the new-line composer is — the same local mirror of Git's
 * name rules said before the press (`checkLineName`), and the same
 * cross-session mutation lock taken fresh at the press and released as soon
 * as the answer is in. */
export function VersionLineRenameStrip({
  port = versionLinesPort,
  projectPath,
  sessionEpoch,
  target,
  isActive,
  upstream,
  existingNames,
  onCancel,
  onRenamed,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
}: {
  port?: VersionLinesPort;
  projectPath: string;
  sessionEpoch: string;
  target: string;
  /** Whether the line is the active one: its chip stays beside the field, as
   * beside the name at rest, so the field starts where the name did. */
  isActive: boolean;
  /** What the line tracks. The remote branch keeps its own name, and the note
   * under the field says so before the press rather than after it. */
  upstream: string | null;
  /** Every loaded line's name, this one included; it is left out of the clash
   * check here, so a case-only rename is Rust's to judge. */
  existingNames: readonly string[];
  onCancel: () => void;
  /** The snapshot the rename returned and the name it was given. The caller
   * releases the mutation lock on this path, as it does for the composer. */
  onRenamed: (snapshot: VersionLinesSnapshot, newName: string) => void;
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [name, setName] = useState(target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const trimmed = name.trim();
  const unchanged = trimmed === target;
  useInstallDraftBlocker(`rename-version-line:${projectPath}:${target}`, t.renameVersionLineInstallBlockerLabel(target), !unchanged);

  /* What a rename usually changes is the last part — `updater-ui` in
     `feat/updater-ui` — so that is what arrives selected; Ctrl+A takes the
     whole name. A name with no `/` is selected whole. */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(target.lastIndexOf("/") + 1, target.length);
  }, [target]);

  /* Cancel gives the name back with the fade it came in with, then closes.
     The wait dies with the strip: choosing another line meanwhile closes it
     already, and a late close would take the keyboard back to this row. */
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );
  function cancel(): void {
    if (busy || leaving) return;
    if (prefersReducedMotion()) {
      onCancel();
      return;
    }
    setLeaving(true);
    leaveTimer.current = window.setTimeout(onCancel, LEAVE_MS);
  }

  const others = existingNames.filter((existing) => existing !== target);
  const nameCheck = unchanged ? null : checkLineName(trimmed, others);
  const nameIssue = nameCheck && (nameCheck.when === "live" || submitAttempted) ? nameCheck.issue : null;
  const canSubmit = trimmed.length > 0 && !unchanged && !busy && !leaving && nameCheck?.when !== "live";

  async function handleRename(): Promise<void> {
    if (!canSubmit) return;
    if (nameCheck) {
      // A name that only ends wrong: say so now, and ask Git for nothing.
      setSubmitAttempted(true);
      return;
    }
    if (!onOperationStart()) return;
    setBusy(true);
    setError(null);
    onOperationPhaseChange("planning");
    try {
      const plan = await port.planRename({ projectId: projectPath, sessionEpoch, name: target, newName: trimmed });
      onOperationPhaseChange("executing");
      const snapshot = await port.rename({
        projectId: projectPath,
        sessionEpoch,
        name: target,
        newName: trimmed,
        stateToken: plan.stateToken,
      });
      onOperationPhaseChange("success");
      onRenamed(snapshot, trimmed);
    } catch (caught) {
      onOperationPhaseChange("error");
      setBusy(false);
      setError(caught);
      // Released at once, as the composer does: nothing was changed by the
      // failed attempt, and a strip is not a modal that holds the reader.
      onOperationFinish();
    }
  }

  const note = upstream ? t.versionLinesRenameInlineUpstreamNote(upstream) : t.versionLinesRenameInlineNote;
  const noteTooltip = upstream
    ? `${t.renameVersionLineNote} ${t.renameVersionLineUpstreamNote(upstream)}`
    : t.renameVersionLineNote;

  const invalid = Boolean(nameIssue || error);

  return (
    <header
      className={`version-lines-detail__strip version-lines-detail__strip--editing${
        leaving ? " version-lines-detail__strip--leaving" : ""
      }`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <div className="version-lines-detail__identity">
        <h2>
          {/* The field sizes itself to the name, so the chip after it stays
              beside the name rather than at the strip's far end: a hidden copy
              of the text sets the width, the field lies over it. */}
          <span className="version-lines-rename__name">
            <span className="version-lines-rename__sizer" aria-hidden="true">
              {name || " "}
            </span>
            <input
              ref={fieldRef}
              className="version-lines-rename__field"
              type="text"
              value={name}
              readOnly={busy || leaving}
              aria-busy={busy || undefined}
              aria-label={t.renameVersionLineTitle(target)}
              aria-invalid={invalid || undefined}
              aria-describedby={noteId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setSubmitAttempted(false);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRename();
                }
              }}
            />
          </span>
          {isActive && (
            <span className="version-line-chip version-line-chip--active">{t.versionLinesActiveLabel}</span>
          )}
        </h2>
        {/* One line, whichever of three things is true: why Git would refuse
            the name, why it did, or what renaming does and does not touch.
            The slot takes the byline's place with one fade; what is in it
            changes as the name is typed without fading again. */}
        <div className="version-lines-rename__note-slot">
        {nameIssue ? (
          <p id={noteId} className="field-error version-lines-rename__note" aria-live="polite">
            <CircleAlert aria-hidden="true" />
            <span>{t.versionLinesNameIssue(nameIssue)}</span>
          </p>
        ) : error !== null ? (
          <p
            id={noteId}
            className="field-error version-lines-rename__note"
            role="alert"
            data-tooltip={localizeAppError(error, t, t.errorGitCommandFailed)}
          >
            <CircleAlert aria-hidden="true" />
            <span>{localizeAppError(error, t, t.errorGitCommandFailed)}</span>
          </p>
        ) : (
          <p id={noteId} className="version-lines-detail__meta version-lines-rename__note" data-tooltip={noteTooltip}>
            <span>{note}</span>
          </p>
        )}
        </div>
      </div>
      {/* Two circles where Switch, Rename and Delete were: the strip's own
          icon actions, so nothing changes size, and confirming is a glyph in
          the accent rather than a second filled button. While the rename runs
          the check turns into the spinner in its place. */}
      <div className="version-lines-detail__actions version-lines-rename__actions">
        <button
          className="version-lines-detail__icon-action"
          type="button"
          disabled={busy}
          onClick={cancel}
          aria-label={t.commonCancel}
          data-tooltip={`${t.commonCancel} (Esc)`}
        >
          <X aria-hidden="true" />
        </button>
        <button
          className="version-lines-detail__icon-action version-lines-rename__confirm"
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleRename()}
          aria-label={busy ? t.renameVersionLineRenaming : t.renameVersionLineConfirm}
          data-tooltip={`${t.renameVersionLineConfirm} (Enter)`}
        >
          {busy ? <LoaderCircle aria-hidden="true" className="icon--spinning" /> : <Check aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
