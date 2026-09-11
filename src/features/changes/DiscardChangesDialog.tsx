import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import {
  autoHideScrollbarProps,
  DialogCloseButton,
  moveFocusWithinRadioGroup,
  useModalFocus,
} from "../../shared/ui";
import type { ChangesController } from "./controller";
import type {
  DiscardPlan,
  DiscardRecovery,
  DiscardRecoveryRecord,
  DiscardResult,
} from "./domain";

export type DiscardDialogRequest = { mode: "selected" | "all" | "restore"; selectedPath: string | null };
type State =
  | { status: "loading" }
  | { status: "plan-error"; error: unknown }
  | { status: "ready-discard"; plan: DiscardPlan }
  /** Every stored recovery, not just the newest: a second discard used to hide
   * the first one behind it, and pressing Restore twice never reached it. */
  | { status: "ready-restore"; recoveries: DiscardRecoveryRecord[]; selectedId: string | null }
  | { status: "submitting"; plan: DiscardPlan | DiscardRecovery | DiscardRecoveryRecord }
  | { status: "submit-error"; plan: DiscardPlan | DiscardRecovery | DiscardRecoveryRecord; error: unknown }
  | { status: "discarded"; result: DiscardResult; recovery: DiscardRecovery }
  | { status: "restored"; fileCount: number };

/** What a listed row needs to offer deleting: which row is currently asking,
 * and the three answers to that question. */
type ForgetControls = {
  pendingId: string | null;
  ask: (recoveryId: string) => void;
  cancel: () => void;
  run: (record: DiscardRecoveryRecord) => void;
};

/** The first one that can actually be applied — normally the newest, since a
 * restore is only offered while the tree is still as that discard left it. */
function firstRestorable(recoveries: DiscardRecoveryRecord[]): string | null {
  return recoveries.find((record) => record.availability === "restorable")?.recoveryId ?? null;
}

/** What one stored recovery says about itself, wherever it is listed. */
function RecoveryCardBody({
  record,
  t,
  formatWhen,
}: {
  record: DiscardRecoveryRecord;
  t: Translations;
  formatWhen: (createdAtMs: number) => string;
}): React.JSX.Element {
  const preview = record.previewPaths.join(", ");
  const hidden = record.fileCount - record.previewPaths.length;
  return (
    <>
      <span className="choice-list__label">
        {formatWhen(record.createdAtMs)}
        <span className="choice-list__badge">{t.changesRestoreEntryPaths(record.fileCount)}</span>
      </span>
      <span className="choice-list__description">
        {hidden > 0 ? t.changesRestoreEntryMore(preview, hidden) : preview}
      </span>
      {/* Said before the press, not after: this record brings its files back
          but leaves the prepared state alone, because the project has moved on
          since and its copy of that state is the older one. */}
      {record.availability === "restorable" && !record.restoresPreparedState && (
        <span className="changes-restore-option__reason">{t.changesRestorePreparedNote}</span>
      )}
      {record.availability !== "restorable" && (
        <span className="changes-restore-option__reason">
          {record.availability === "superseded"
            ? t.changesRestoreUnavailableSuperseded
            : t.changesRestoreUnavailableIncomplete}
        </span>
      )}
    </>
  );
}

/** One listed record, with the one thing that can be done to it besides
 * restoring it.
 *
 * Deleting asks first, in place: the row becomes its own question rather than
 * opening a second dialog over the first, so the list it belongs to stays
 * readable behind the choice, and "Keep it" is plainly a local answer instead
 * of another way to dismiss the dialog. There is no undo behind this one —
 * the copy is the only one there is — which is exactly why it is never a
 * single click. */
function RecoveryRow({
  record,
  isPending,
  onAskForget,
  onCancelForget,
  onForget,
  t,
  children,
}: {
  record: DiscardRecoveryRecord;
  isPending: boolean;
  onAskForget: () => void;
  onCancelForget: () => void;
  onForget: () => void;
  t: Translations;
  children: React.ReactNode;
}): React.JSX.Element {
  if (isPending) {
    return (
      <div className="changes-restore-row changes-restore-row--forgetting">
        <p className="changes-restore-row__question">
          <strong>{t.changesRestoreForgetTitle}</strong>
          {t.changesRestoreForgetWarning(record.fileCount)}
        </p>
        <div className="changes-restore-row__answers">
          <button className="secondary-button secondary-button--sm" type="button" onClick={onCancelForget}>
            {t.changesRestoreForgetCancel}
          </button>
          <button className="changes-danger-button changes-danger-button--sm" type="button" onClick={onForget}>
            {t.changesRestoreForgetConfirm}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="changes-restore-row">
      {children}
      <button
        type="button"
        className="changes-restore-row__forget"
        aria-label={t.changesRestoreForget}
        data-tooltip={t.changesRestoreForget}
        onClick={onAskForget}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

/** The recoveries that can be applied, as stacked option cards — the same
 * shape Settings uses to choose one of several things. Only these are options:
 * a radio group whose members cannot be picked is a group of buttons that lie
 * about being choices. */
function RestorePicker({
  recoveries,
  selectedId,
  onSelect,
  forget,
  t,
  formatWhen,
}: {
  recoveries: DiscardRecoveryRecord[];
  selectedId: string | null;
  onSelect: (recoveryId: string) => void;
  forget: ForgetControls;
  t: Translations;
  formatWhen: (createdAtMs: number) => string;
}): React.JSX.Element {
  return (
    <div
      {...autoHideScrollbarProps<HTMLDivElement>()}
      className="choice-list changes-restore-list auto-hide-scrollbar"
      role="radiogroup"
      aria-label={t.changesRestoreChooseLabel}
      onKeyDown={moveFocusWithinRadioGroup}
    >
      {recoveries.map((record) => {
        const isSelected = record.recoveryId === selectedId;
        return (
          <RecoveryRow
            key={record.recoveryId}
            record={record}
            isPending={forget.pendingId === record.recoveryId}
            onAskForget={() => forget.ask(record.recoveryId)}
            onCancelForget={forget.cancel}
            onForget={() => forget.run(record)}
            t={t}
          >
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`choice-list__option${isSelected ? " choice-list__option--active" : ""}`}
              onClick={() => onSelect(record.recoveryId)}
            >
              <RecoveryCardBody record={record} t={t} formatWhen={formatWhen} />
            </button>
          </RecoveryRow>
        );
      })}
    </div>
  );
}

/** The ones the working tree has moved past, folded away behind a count.
 *
 * They are kept and shown rather than dropped for two reasons: a superseded
 * record is not dead — restoring the discard on top of it can make it
 * applicable again, which is how stepping back through two discards works —
 * and a list that quietly omitted them would read as "that work is gone" when
 * the snapshot is still on disk. Collapsed, they cost one line until asked
 * for. */
function UnavailableRecoveries({
  recoveries,
  isOpen,
  onToggle,
  forget,
  t,
  formatWhen,
}: {
  recoveries: DiscardRecoveryRecord[];
  isOpen: boolean;
  onToggle: () => void;
  forget: ForgetControls;
  t: Translations;
  formatWhen: (createdAtMs: number) => string;
}): React.JSX.Element {
  return (
    <div className="changes-restore-unavailable">
      <button
        type="button"
        className="changes-restore-unavailable__toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        {isOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        {t.changesRestoreUnavailableToggle(recoveries.length)}
      </button>
      {isOpen && (
        <div className="choice-list">
          {recoveries.map((record) => (
            <RecoveryRow
              key={record.recoveryId}
              record={record}
              isPending={forget.pendingId === record.recoveryId}
              onAskForget={() => forget.ask(record.recoveryId)}
              onCancelForget={forget.cancel}
              onForget={() => forget.run(record)}
              t={t}
            >
              <div className="choice-list__option changes-restore-option--static">
                <RecoveryCardBody record={record} t={t} formatWhen={formatWhen} />
              </div>
            </RecoveryRow>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiscardChangesDialog({
  request,
  projectPath,
  sessionEpoch,
  controller,
  onClose,
  onMutationCompleted,
  onPhaseChange,
}: {
  request: DiscardDialogRequest | null;
  projectPath: string;
  sessionEpoch: string;
  controller: ChangesController;
  onClose: () => void;
  onMutationCompleted: () => void;
  onPhaseChange?: (phase: "planning" | "executing" | "error" | "success") => void;
}): React.JSX.Element | null {
  const { t, formatDate } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isBusyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onMutationCompletedRef = useRef(onMutationCompleted);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onCloseRef.current = onClose;
  onMutationCompletedRef.current = onMutationCompleted;
  onPhaseChangeRef.current = onPhaseChange;
  const setOpenState = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? next(true) : next;
    if (!value && !isBusyRef.current) onCloseRef.current();
  }, []);
  useModalFocus(request !== null, dialogRef, setOpenState);
  const [retry, setRetry] = useState(0);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [pendingForget, setPendingForget] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setState({ status: "loading" });
    // Folded again on every open: what this dialog offers is the choices, and
    // an expanded list of what it cannot do is not where anyone starts.
    setShowUnavailable(false);
    setPendingForget(null);
    onPhaseChangeRef.current?.("planning");
    const load = request.mode === "restore"
      ? controller.listDiscardRecoveries(projectPath, sessionEpoch)
        .then((recoveries) => ({ status: "ready-restore", recoveries, selectedId: firstRestorable(recoveries) }) as const)
      : controller.planDiscard(projectPath, sessionEpoch, request.mode === "selected" ? request.selectedPath : null)
        .then((plan) => ({ status: "ready-discard", plan }) as const);
    load.then((next) => { if (!cancelled) setState(next); })
      .catch((error: unknown) => { if (!cancelled) { setState({ status: "plan-error", error }); onPhaseChangeRef.current?.("error"); } });
    return () => { cancelled = true; };
  }, [controller, projectPath, request, retry, sessionEpoch]);

  useEffect(() => {
    if (!request || state.status === "loading") return undefined;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [request, state.status]);

  if (!request) return null;
  const isBusy = state.status === "submitting";
  isBusyRef.current = isBusy;
  const plan = "plan" in state ? state.plan : null;
  const discardPlan = plan && "counts" in plan ? plan : null;
  /* The record a restore is currently running against, which is the only thing
     left to name once the picker is gone. */
  const restoringRecovery = plan && "recoveryId" in plan ? plan : null;
  const isRestore = request.mode === "restore" || state.status === "restored";
  const chosen = state.status === "ready-restore"
    ? state.recoveries.find((record) => record.recoveryId === state.selectedId) ?? null
    : null;
  /* A failure can always be tried again: reloading the plan (or the list) is
     exactly what a stale state token needs, and leaving an error with nothing
     to press makes the dialog a dead end. */
  const isFailed = state.status === "plan-error" || state.status === "submit-error";
  const recoveries = state.status === "ready-restore" ? state.recoveries : [];
  const applicable = recoveries.filter((record) => record.availability === "restorable");
  const unavailable = recoveries.filter((record) => record.availability !== "restorable");
  const hasActions = isFailed
    || state.status === "ready-discard"
    || state.status === "discarded"
    || (state.status === "ready-restore" && applicable.length > 0);

  const restore = (record: DiscardRecovery | DiscardRecoveryRecord, stateToken: string): void => {
    setState({ status: "submitting", plan: record });
    onPhaseChangeRef.current?.("executing");
    controller.restoreDiscard(projectPath, sessionEpoch, record.recoveryId, stateToken)
      .then(() => { setState({ status: "restored", fileCount: record.fileCount }); onPhaseChangeRef.current?.("success"); onMutationCompletedRef.current(); })
      .catch((error: unknown) => { setState({ status: "submit-error", plan: record, error }); onPhaseChangeRef.current?.("error"); });
  };

  const confirm = (): void => {
    if (state.status === "ready-discard") {
      const currentPlan = state.plan;
      setState({ status: "submitting", plan: currentPlan });
      onPhaseChangeRef.current?.("executing");
      controller.discard(projectPath, sessionEpoch, currentPlan.selectedPath, currentPlan.stateToken)
        .then((result) => {
          setState({ status: "discarded", result, recovery: result.recovery });
          onPhaseChangeRef.current?.("success");
          onMutationCompletedRef.current();
        })
        .catch((error: unknown) => { setState({ status: "submit-error", plan: currentPlan, error }); onPhaseChangeRef.current?.("error"); });
    } else if (chosen?.stateToken) {
      restore(chosen, chosen.stateToken);
    }
  };

  /* Deleting reloads the list rather than announcing itself: the record is
     gone, and the list without it says that better than a sentence would. A
     failure lands in the dialog's own error state, whose retry is this same
     reload. */
  const forget: ForgetControls = {
    pendingId: pendingForget,
    ask: (recoveryId) => setPendingForget(recoveryId),
    cancel: () => setPendingForget(null),
    run: (record) => {
      setPendingForget(null);
      controller.deleteDiscardRecovery(projectPath, sessionEpoch, record.recoveryId)
        // No mutation announcement: the working tree did not move, only the
        // store of copies beside it, and a status re-read would be work done
        // for nothing.
        .then(() => setRetry((value) => value + 1))
        .catch((error: unknown) => { setState({ status: "submit-error", plan: record, error }); onPhaseChangeRef.current?.("error"); });
    },
  };

  const undo = (): void => {
    if (state.status !== "discarded") return;
    restore(state.recovery, state.recovery.stateToken);
  };

  /* A dialog that has done the thing stops asking whether to do it: a heading
     still reading "Discard this file's changes?" over "1 file went back to its
     last saved version" contradicts itself, and that heading is what a screen
     reader announces when focus lands here. */
  const title = state.status === "discarded" ? t.changesDiscardDoneTitle
    : state.status === "restored" ? t.changesRestoreDoneTitle
      : isRestore ? t.changesRestoreTitle
        : request.mode === "selected" ? t.changesDiscardFileTitle : t.changesDiscardAllTitle;

  return (
    <div className="changes-discard-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isBusy) onClose();
    }}>
      <div ref={dialogRef} className="changes-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="changes-discard-title" tabIndex={-1}>
        <header className="changes-discard-dialog__header">
          <h2 id="changes-discard-title" ref={headingRef} tabIndex={-1}>{title}</h2>
          {/* The same control every other dialog closes with. Gone while a
              mutation is running, exactly like the backdrop's own dismissal. */}
          {!isBusy && <DialogCloseButton label={t.commonClose} onClick={onClose} />}
        </header>
        {/* Both flows report the same way in both of their waiting states: a
            spinner and a line saying what is being waited on. The running one
            matters most — before it, the dialog sat there with its buttons
            gone and nothing at all in their place. */}
        {state.status === "loading" && (
          <p className="changes-discard-status">
            <LoaderCircle className="icon--spinning" aria-hidden="true" />
            {isRestore ? t.changesRestoreLoading : t.changesDiscardLoading}
          </p>
        )}
        {isBusy && (
          <p className="changes-discard-status">
            <LoaderCircle className="icon--spinning" aria-hidden="true" />
            {restoringRecovery ? t.changesRestoreSummary(restoringRecovery.fileCount) : t.changesDiscardingNow}
          </p>
        )}
        {discardPlan && (
          <div className="changes-discard-summary">
            <p>{discardPlan.selectedPath ? t.changesDiscardFileSummary(discardPlan.selectedPath) : t.changesDiscardAllSummary(discardPlan.fileCount)}</p>
            <ul>
              {discardPlan.affectsPreparedChanges && <li>{t.changesDiscardPreparedWarning}</li>}
              {discardPlan.removesUntrackedFiles && <li>{t.changesDiscardUntrackedWarning}</li>}
              {discardPlan.includesConflicts && <li>{t.changesDiscardConflictWarning}</li>}
            </ul>
            <p className="changes-discard-recovery"><RotateCcw aria-hidden="true" />{t.changesDiscardRecoveryNote}</p>
          </div>
        )}
        {state.status === "ready-restore" && (
          recoveries.length === 0
            ? <p>{t.changesRestoreEmpty}</p>
            : (
              <>
                <p>{applicable.length > 0 ? t.changesRestoreChooseIntro : t.changesRestoreNoneAvailable}</p>
                {applicable.length > 0 && (
                  <RestorePicker
                    recoveries={applicable}
                    selectedId={state.selectedId}
                    onSelect={(recoveryId) => setState({ ...state, selectedId: recoveryId })}
                    forget={forget}
                    t={t}
                    formatWhen={(createdAtMs) => formatDate(new Date(createdAtMs), "date-time")}
                  />
                )}
                {unavailable.length > 0 && (
                  <UnavailableRecoveries
                    recoveries={unavailable}
                    isOpen={showUnavailable}
                    onToggle={() => setShowUnavailable((value) => !value)}
                    forget={forget}
                    t={t}
                    formatWhen={(createdAtMs) => formatDate(new Date(createdAtMs), "date-time")}
                  />
                )}
              </>
            )
        )}
        {(state.status === "plan-error" || state.status === "submit-error") && (
          <p className="changes-discard-error" role="alert"><CircleAlert aria-hidden="true" />{localizeAppError(state.error, t, t.changesDiscardUnavailable)}</p>
        )}
        {state.status === "discarded" && <div className="changes-discard-success"><CheckCircle2 aria-hidden="true" /><p>{t.changesDiscardSuccess(state.result.discardedFiles)}</p></div>}
        {state.status === "restored" && <div className="changes-discard-success"><CheckCircle2 aria-hidden="true" /><p>{t.changesRestoreSuccess(state.fileCount)}</p></div>}
        {/* Rendered only when it holds something. Nothing here dismisses the
            dialog — that is the corner control's job, and a Close button beside
            an X is the same door twice — so a state whose work is finished
            offers no button at all. */}
        {hasActions && <div className="dialog-actions">
          {isFailed && <button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>{t.changesDiffRetry}</button>}
          {state.status === "discarded" && <button className="secondary-button" type="button" onClick={undo}><RotateCcw aria-hidden="true" />{t.changesUndoDiscard}</button>}
          {/* No Cancel anywhere: every dialog in here dismisses through the
              same corner control, the backdrop and Escape. The destructive
              confirmation keeps its own weight through the danger button being
              the only thing to press, never through a second way out. */}
          {state.status === "ready-discard" && <button className="changes-danger-button" type="button" onClick={confirm}><Trash2 aria-hidden="true" />{state.plan.selectedPath ? t.changesDiscardConfirmFile : t.changesDiscardConfirmAll}</button>}
          {/* Disabled rather than absent when nothing can be restored: the list
              above is showing why, and a button that vanishes leaves the reader
              looking for it. */}
          {state.status === "ready-restore" && applicable.length > 0 && (
            <button className="primary-button" type="button" disabled={chosen?.stateToken == null} onClick={confirm}>
              <RotateCcw aria-hidden="true" />{t.changesRestoreConfirm}
            </button>
          )}
          {/* A finished action gets a button to close on. Nothing to restore
              is not a finished action — it is a dialog with nothing to press,
              so it offers nothing and leaves the corner control to do it. */}
        </div>}
      </div>
    </div>
  );
}
