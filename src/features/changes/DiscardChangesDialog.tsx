import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";

import { useLanguage } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { useModalFocus } from "../../shared/ui";
import type { ChangesController } from "./controller";
import type { DiscardPlan, DiscardRecovery, DiscardResult } from "./domain";

export type DiscardDialogRequest = { mode: "selected" | "all" | "restore"; selectedPath: string | null };
type State =
  | { status: "loading" }
  | { status: "plan-error"; error: unknown }
  | { status: "ready-discard"; plan: DiscardPlan }
  | { status: "ready-restore"; recovery: DiscardRecovery }
  | { status: "submitting"; plan: DiscardPlan | DiscardRecovery }
  | { status: "submit-error"; plan: DiscardPlan | DiscardRecovery; error: unknown }
  | { status: "discarded"; result: DiscardResult; recovery: DiscardRecovery }
  | { status: "restored" };

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
  const { t } = useLanguage();
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
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setState({ status: "loading" });
    onPhaseChangeRef.current?.("planning");
    const load = request.mode === "restore"
      ? controller.getDiscardRecovery(projectPath, sessionEpoch).then((recovery) => ({ status: "ready-restore", recovery }) as const)
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
  const recovery = state.status === "ready-restore" ? state.recovery : plan && "recoveryId" in plan ? plan : null;
  const isRestore = request.mode === "restore" || state.status === "restored";

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
    } else if (state.status === "ready-restore") {
      const currentRecovery = state.recovery;
      setState({ status: "submitting", plan: currentRecovery });
      onPhaseChangeRef.current?.("executing");
      controller.restoreDiscard(projectPath, sessionEpoch, currentRecovery.recoveryId, currentRecovery.stateToken)
        .then(() => { setState({ status: "restored" }); onPhaseChangeRef.current?.("success"); onMutationCompletedRef.current(); })
        .catch((error: unknown) => { setState({ status: "submit-error", plan: currentRecovery, error }); onPhaseChangeRef.current?.("error"); });
    }
  };

  const undo = (): void => {
    if (state.status !== "discarded") return;
    const protectedRecovery = state.recovery;
    setState({ status: "submitting", plan: protectedRecovery });
    onPhaseChangeRef.current?.("executing");
    controller.restoreDiscard(projectPath, sessionEpoch, protectedRecovery.recoveryId, protectedRecovery.stateToken)
      .then(() => { setState({ status: "restored" }); onPhaseChangeRef.current?.("success"); onMutationCompletedRef.current(); })
      .catch((error: unknown) => { setState({ status: "submit-error", plan: protectedRecovery, error }); onPhaseChangeRef.current?.("error"); });
  };

  const title = isRestore ? t.changesRestoreTitle
    : request.mode === "selected" ? t.changesDiscardFileTitle : t.changesDiscardAllTitle;

  return (
    <div className="changes-discard-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isBusy) onClose();
    }}>
      <div ref={dialogRef} className="changes-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="changes-discard-title" tabIndex={-1}>
        <h2 id="changes-discard-title" ref={headingRef} tabIndex={-1}>{title}</h2>
        {state.status === "loading" && <p className="changes-discard-status"><LoaderCircle className="icon--spinning" aria-hidden="true" />{t.changesDiscardLoading}</p>}
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
        {recovery && !discardPlan && <p>{t.changesRestoreSummary(recovery.fileCount)}</p>}
        {(state.status === "plan-error" || state.status === "submit-error") && (
          <p className="changes-discard-error" role="alert"><CircleAlert aria-hidden="true" />{localizeAppError(state.error, t, t.changesDiscardUnavailable)}</p>
        )}
        {state.status === "discarded" && <div className="changes-discard-success"><CheckCircle2 aria-hidden="true" /><p>{t.changesDiscardSuccess(state.result.discardedFiles)}</p></div>}
        {state.status === "restored" && <div className="changes-discard-success"><CheckCircle2 aria-hidden="true" /><p>{t.changesRestoreSuccess}</p></div>}
        <div className="dialog-actions">
          {state.status === "plan-error" && <button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>{t.changesDiffRetry}</button>}
          {state.status === "discarded" && <button className="secondary-button" type="button" onClick={undo}><RotateCcw aria-hidden="true" />{t.changesUndoDiscard}</button>}
          {(state.status === "ready-discard" || state.status === "ready-restore") && <button className="secondary-button" type="button" onClick={onClose}>{t.commonCancel}</button>}
          {state.status === "ready-discard" && <button className="changes-danger-button" type="button" onClick={confirm}><Trash2 aria-hidden="true" />{state.plan.selectedPath ? t.changesDiscardConfirmFile : t.changesDiscardConfirmAll}</button>}
          {state.status === "ready-restore" && <button className="primary-button" type="button" onClick={confirm}><RotateCcw aria-hidden="true" />{t.changesRestoreConfirm}</button>}
          {(state.status === "discarded" || state.status === "restored" || state.status === "plan-error" || state.status === "submit-error") && <button className="primary-button" type="button" onClick={onClose}>{t.commonClose}</button>}
        </div>
      </div>
    </div>
  );
}
