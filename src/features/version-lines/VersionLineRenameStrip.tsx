import React, { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError } from "../../shared/i18n";
import type { VersionLinesSnapshot } from "./domain";
import { checkLineName } from "./lineNames";
import type { VersionLinesPort } from "./port";
import { versionLinesPort } from "./tauriAdapter";

/** The detail strip while its line is being renamed: the name becomes the
 * field, the line under it becomes what the rename will and will not change —
 * or why Git would refuse the name — and the actions become Cancel and Rename.
 * The strip keeps its height, so nothing on the panel moves.
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
  const fieldRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const trimmed = name.trim();
  const unchanged = trimmed === target;
  useInstallDraftBlocker(`rename-version-line:${projectPath}:${target}`, t.renameVersionLineInstallBlockerLabel(target), !unchanged);

  // Renaming is usually replacing, so the whole name is selected on arrival.
  useEffect(() => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, []);

  const others = existingNames.filter((existing) => existing !== target);
  const nameCheck = unchanged ? null : checkLineName(trimmed, others);
  const nameIssue = nameCheck && (nameCheck.when === "live" || submitAttempted) ? nameCheck.issue : null;
  const canSubmit = trimmed.length > 0 && !unchanged && !busy && nameCheck?.when !== "live";

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

  return (
    <header
      className="version-lines-detail__strip version-lines-detail__strip--editing"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="version-lines-detail__identity">
        <input
          ref={fieldRef}
          className="version-lines-rename__field"
          type="text"
          value={name}
          disabled={busy}
          aria-label={t.renameVersionLineTitle(target)}
          aria-invalid={nameIssue || error ? true : undefined}
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
        {/* One line, whichever of three things is true: why Git would refuse
            the name, why it did, or what renaming does and does not touch. */}
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
      <div className="version-lines-detail__actions">
        <button className="secondary-button secondary-button--sm" type="button" disabled={busy} onClick={onCancel}>
          {t.commonCancel}
        </button>
        <button
          className="primary-button primary-button--sm"
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleRename()}
        >
          {busy ? (
            <>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              {t.renameVersionLineRenaming}
            </>
          ) : (
            t.renameVersionLineConfirm
          )}
        </button>
      </div>
    </header>
  );
}
