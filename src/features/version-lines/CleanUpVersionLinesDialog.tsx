import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, LoaderCircle, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import {
  autoHideScrollbarProps,
  Dialog,
  DialogFacts,
  InclusionNode,
  LoadingPlaceholder,
  StateGlyph,
  StateGlyphs,
  TextPlaceholder,
  useModalFocus,
  useToast,
} from "../../shared/ui";
import type {
  CleanUpLine,
  CleanUpVersionLinesPlan,
  CleanUpVersionLinesResult,
  VersionLine,
  VersionLinesSnapshot,
} from "./domain";
import { rowGlyphs } from "./lineGlyphs";
import { versionLinesPort } from "./tauriAdapter";
import { ErrorBanner, lineName } from "./VersionLinesDialog";

/** The most lines one clean-up asks for. Rust keeps one recovery point per
 * deleted line and refuses a clean-up longer than the points it keeps. */
export const MAX_CLEAN_UP_LINES = 50;

type CleanUpState =
  | { status: "loading" }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: CleanUpVersionLinesPlan }
  | { status: "deleting"; plan: CleanUpVersionLinesPlan }
  | { status: "delete-error"; plan: CleanUpVersionLinesPlan; error: unknown }
  | { status: "done"; result: CleanUpVersionLinesResult };

/** Where the line's work is kept, in a few words: the first ref that holds it,
 * and how many more do. */
function keptOn(line: CleanUpLine, t: Translations): string {
  return t.cleanUpLinesKeptOn(lineName(line.retainedBy[0] ?? ""), Math.max(0, line.retainedBy.length - 1));
}

/** "Review" on Lines' Ready to clean up block: the block's lines in one
 * confirmed, destructive step. Every line is checked again by Rust before it
 * goes, and keeps a recovery point with its name and tip; a line that stopped
 * qualifying is skipped and reported, never a reason to stop the rest. */
export function CleanUpVersionLinesDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  lines,
  onClose,
  onCleanedUp,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  /** The block's lines, in the order the list draws them. */
  lines: readonly VersionLine[];
  onClose: () => void;
  /** The fresh snapshot, handed over as soon as anything was deleted —
   * `null` when Rust could not read it afterwards, so the host refreshes. */
  onCleanedUp: (snapshot: VersionLinesSnapshot | null) => void;
  onPhaseChange?: (phase: "planning" | "executing" | "error" | "success") => void;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<CleanUpState>({ status: "loading" });
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  /* Off by default, unlike the single delete: a clean-up is many shared
     branches at once, and taking them off the remote for the whole team is
     the step to ask for rather than to opt out of. */
  const [deleteRemote, setDeleteRemote] = useState(false);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const onCloseRef = useRef(onClose);
  const isBusyRef = useRef(false);
  onCloseRef.current = onClose;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? (next as (previous: boolean) => boolean)(true) : next;
    if (!value && !isBusyRef.current) {
      onCloseRef.current();
    }
  }, []);
  useModalFocus(isOpen, dialogRef, setOpenState);

  /* The names asked for are fixed when the dialog opens: the list refreshing
     under an open preview must not re-plan it, any more than the single
     delete re-plans when its line's row redraws. */
  const asked = useMemo(
    () => lines.slice(0, MAX_CLEAN_UP_LINES).map((line) => line.name),
    [isOpen, retryToken],
  );
  const byName = useMemo(() => new Map(lines.map((line) => [line.name, line])), [lines]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    setDeleteRemote(false);
    onPhaseChangeRef.current?.("planning");
    versionLinesPort
      .planCleanUp({ projectId: projectPath, sessionEpoch, names: asked })
      .then((plan) => {
        if (cancelled) return;
        setChosen(new Set(plan.lines.map((line) => line.name)));
        setState({ status: "ready", plan });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: "blocked", error });
        onPhaseChangeRef.current?.("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath, sessionEpoch, asked]);

  if (!isOpen) {
    return null;
  }

  const isBusy = state.status === "deleting";
  isBusyRef.current = isBusy;

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

  const plan = "plan" in state ? state.plan : null;
  const chosenLines = plan ? plan.lines.filter((line) => chosen.has(line.name)) : [];
  const publishedChosen = chosenLines.filter((line) => line.published !== null).length;
  /* Fixed for the dialog's life, so the option and the facts never come and
     go as lines are ticked: the dialog keeps one size. */
  const anyPublished = plan !== null && plan.lines.some((line) => line.published !== null);

  function toggle(name: string, on: boolean): void {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function handleConfirm(): void {
    if (state.status !== "ready" && state.status !== "delete-error") return;
    const current = state.plan;
    const requested = current.lines.filter((line) => chosen.has(line.name));
    if (requested.length === 0) return;
    const remote = deleteRemote && requested.some((line) => line.published !== null);
    setState({ status: "deleting", plan: current });
    onPhaseChangeRef.current?.("executing");
    versionLinesPort
      .cleanUp({
        projectId: projectPath,
        sessionEpoch,
        lines: requested.map((line) => ({ name: line.name, stateToken: line.stateToken })),
        deleteRemote: remote,
      })
      .then((result) => {
        onPhaseChangeRef.current?.("success");
        onCleanedUp(result.snapshot);
        const deleted = result.lines.filter((line) => line.outcome === "deleted");
        const clean =
          deleted.length === result.lines.length && deleted.every((line) => line.remoteError === null);
        if (clean) {
          // Nothing left to read: a toast, and the dialog goes.
          showToast({ icon: <Trash2 />, message: t.cleanUpLinesToast(deleted.length, remote) });
          onCloseRef.current();
          return;
        }
        // Something was kept or is still published: that stays on screen
        // until it has been read.
        setState({ status: "done", result });
      })
      .catch((error: unknown) => {
        setState({ status: "delete-error", plan: current, error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const allChosen = plan !== null && plan.lines.length > 0 && chosenLines.length === plan.lines.length;
  const someChosen = chosenLines.length > 0 && !allChosen;

  const lineGlyphs = (name: string): React.ReactNode => {
    const line = byName.get(name);
    if (!line) return null;
    const glyphs = rowGlyphs(line, t, formats);
    if (glyphs.length === 0) return null;
    return (
      <StateGlyphs>
        {glyphs.map((glyph) => (
          <StateGlyph key={glyph.key} tone={glyph.tone} icon={glyph.icon} count={glyph.count} tooltip={glyph.tooltip} />
        ))}
      </StateGlyphs>
    );
  };

  /* DESIGN.md § Dialogs: a confirmation that removes work leads in danger,
     a block the reader cannot lift here in warning, a result in success. */
  const nothingToDelete = plan !== null && plan.lines.length === 0;
  return (
    <Dialog
      size="m"
      role={nothingToDelete ? "alertdialog" : "dialog"}
      title={
        state.status === "done"
          ? t.cleanUpLinesDoneTitle
          : nothingToDelete
            ? t.cleanUpLinesBlockedTitle
            : t.cleanUpLinesTitle
      }
      titleId="clean-up-version-lines-title"
      icon={state.status === "done" ? <CircleCheck /> : nothingToDelete ? <TriangleAlert /> : <Trash2 />}
      tone={state.status === "done" ? "success" : nothingToDelete ? "warning" : "danger"}
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
    >
      {state.status === "loading" && (
        <>
          <LoadingPlaceholder label={t.cleanUpLinesLoading} className="version-line-dialog__placeholder">
            <p className="app-dialog__text"><TextPlaceholder width="74%" /></p>
            <p className="app-dialog__text"><TextPlaceholder width="52%" /></p>
            <p className="app-dialog__text"><TextPlaceholder width="61%" /></p>
          </LoadingPlaceholder>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonCancel}</button>
            <button className="danger-button" type="button" disabled>
              {/* No count until the plan says which lines can go: it may
                  leave some out, and the label would change under the eye. */}
              <Trash2 aria-hidden="true" />{t.cleanUpLinesConfirmPending}
            </button>
          </div>
        </>
      )}

      {state.status === "blocked" && (
        <>
          <ErrorBanner error={state.error} t={t} />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
              {t.versionLinesRetry}
            </button>
          </div>
        </>
      )}

      {plan && (
        <>
          {plan.lines.length > 0 ? (
            <p className="app-dialog__text">{t.cleanUpLinesLead}</p>
          ) : (
            <p className="app-dialog__text" role="status">{t.cleanUpLinesNothing}</p>
          )}
          {lines.length > asked.length && (
            <p className="app-dialog__text">{t.cleanUpLinesCapped(asked.length, lines.length)}</p>
          )}

          {plan.lines.length > 0 && (
            <fieldset className="clean-up-lines" disabled={isBusy}>
              <legend className="visually-hidden">{t.cleanUpLinesListLabel}</legend>
              {/* The lines are items going into the delete, so they wear the
                  Changes list's include node: a disc in, a ring out, and
                  "All lines" a half moon when only some are. */}
              <label className="clean-up-lines__all">
                <InclusionNode
                  inRow
                  className="clean-up-lines__node"
                  checked={allChosen}
                  indeterminate={someChosen}
                  onChange={() => setChosen(new Set(allChosen ? [] : plan.lines.map((line) => line.name)))}
                />
                <span>{t.cleanUpLinesSelectAll(chosenLines.length, plan.lines.length)}</span>
              </label>
              <ul {...autoHideScrollbarProps<HTMLUListElement>()} className="clean-up-lines__list auto-hide-scrollbar">
                {plan.lines.map((line) => (
                  <li key={line.name}>
                    <label className="clean-up-lines__line">
                      <InclusionNode
                        inRow
                        className="clean-up-lines__node"
                        checked={chosen.has(line.name)}
                        onChange={() => toggle(line.name, !chosen.has(line.name))}
                      />
                      <span className="clean-up-lines__name" title={line.name}>{line.name}</span>
                      {lineGlyphs(line.name)}
                      <small className="clean-up-lines__kept">
                        {keptOn(line, t)}
                      </small>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {plan.excluded.length > 0 && (
            <details className="app-dialog__details clean-up-lines__excluded">
              <summary>{t.cleanUpLinesExcludedHeading(plan.excluded.length)}</summary>
              <ul>
                {plan.excluded.map((line) => (
                  <li key={line.name}>
                    <strong>{line.name}</strong>
                    <span>{localizeAppError(line.reason, t, t.errorGitCommandFailed)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* An option for the action, not an item in it: a checkbox, not
              the include node. Off by default: it changes what the whole
              team sees. Shown whenever the plan has a published line, and
              held back — with why — while no chosen line has one, so ticking
              lines never makes it come and go. */}
          {anyPublished && (
            <label className="app-dialog__check app-dialog__check--block">
              <input
                className="app-checkbox"
                type="checkbox"
                checked={deleteRemote && publishedChosen > 0}
                disabled={isBusy || publishedChosen === 0}
                onChange={(event) => setDeleteRemote(event.target.checked)}
              />
              <span>
                <strong>{t.cleanUpLinesRemoteLabel(publishedChosen)}</strong>
                <small>
                  {publishedChosen === 0
                    ? t.cleanUpLinesRemoteNoneNote
                    : deleteRemote
                      ? t.cleanUpLinesRemoteOnNote
                      : t.cleanUpLinesRemoteOffNote}
                </small>
              </span>
            </label>
          )}

          {plan.lines.length > 0 && (
            <DialogFacts
              facts={[
                { icon: <ShieldCheck />, text: t.cleanUpLinesRecoveryFact, safe: true },
              ]}
            />
          )}

          {state.status === "delete-error" && <ErrorBanner error={state.error} t={t} />}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
              {plan.lines.length > 0 ? t.commonCancel : t.commonClose}
            </button>
            {plan.lines.length > 0 && (
              <button
                className="danger-button"
                type="button"
                onClick={handleConfirm}
                disabled={isBusy || chosenLines.length === 0}
                title={chosenLines.length === 0 ? t.cleanUpLinesNoneChosen : undefined}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.cleanUpLinesDeleting}
                  </>
                ) : (
                  <>
                    <Trash2 aria-hidden="true" />
                    {t.cleanUpLinesConfirm(chosenLines.length)}
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}

      {state.status === "done" && <CleanUpSummary result={state.result} t={t} onClose={requestClose} />}
    </Dialog>
  );
}

/** What a clean-up that did not go entirely to plan did, line by line. */
function CleanUpSummary({
  result,
  t,
  onClose,
}: {
  result: CleanUpVersionLinesResult;
  t: Translations;
  onClose: () => void;
}): React.JSX.Element {
  const skipped = result.lines.filter((line) => line.outcome === "skipped");
  const remoteFailed = result.lines.filter((line) => line.outcome === "deleted" && line.remoteError !== null);
  const deleted = result.lines.length - skipped.length;
  return (
    <>
      <p className="app-dialog__text" role="status">
        {t.cleanUpLinesSummary(deleted, skipped.length, remoteFailed.length)}
      </p>
      {skipped.length > 0 && (
        <section className="clean-up-lines__outcome" aria-label={t.cleanUpLinesSkippedHeading}>
          <h3>{t.cleanUpLinesSkippedHeading}</h3>
          <ul>
            {skipped.map((line) => (
              <li key={line.name}>
                <strong>{line.name}</strong>
                <span>{localizeAppError(line.reason, t, t.errorGitCommandFailed)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {remoteFailed.length > 0 && (
        <section className="clean-up-lines__outcome" aria-label={t.cleanUpLinesRemoteFailedHeading}>
          <h3>{t.cleanUpLinesRemoteFailedHeading}</h3>
          <ul>
            {remoteFailed.map((line) => (
              <li key={line.name}>
                <strong>{line.name}</strong>
                {/* Credentials are worth naming; every other refusal is the
                    remote's, and the generic wording for its code is about
                    publishing, not deleting. */}
                <span>
                  {isAppError(line.remoteError) && line.remoteError.code === "authentication_failed"
                    ? localizeAppError(line.remoteError, t, t.cleanUpLinesRemoteRefused)
                    : t.cleanUpLinesRemoteRefused}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deleted > 0 && <DialogFacts facts={[{ icon: <ShieldCheck />, text: t.cleanUpLinesRecoveryKept, safe: true }]} />}
      <div className="dialog-actions">
        <button className="primary-button" type="button" onClick={onClose} data-autofocus>
          {t.commonClose}
        </button>
      </div>
    </>
  );
}
