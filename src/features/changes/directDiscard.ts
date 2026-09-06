import { useState } from "react";

import type { Translations } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import type { ChangesController } from "./controller";
import type { DiscardRecovery } from "./domain";

/** What the Changes header reports after a discard that was never confirmed.
 * `null` is "nothing to report", which is also what dismissing returns to. */
export type DirectDiscardOutcome =
  | { status: "running" }
  | { status: "discarded"; discardedFiles: number; recovery: DiscardRecovery }
  | { status: "restored"; restoredFiles: number }
  | { status: "error"; message: string };

export type DirectDiscardRequest = { mode: "selected" | "all"; selectedPath: string | null };

/** The discard flow with the confirmation step removed.
 *
 * Deliberately not a mode of `DiscardChangesDialog`: someone who turned the
 * confirmation off asked to stop clicking through a dialog, and a dialog that
 * only reports the outcome still costs them that click. The plan is still read
 * first — it is what produces the state token the mutation is checked against —
 * and the recovery point Rust creates is still offered, as an Undo beside the
 * result rather than inside a modal.
 *
 * Restoring is not covered here. It is a recovery action, not a destructive
 * one, so it keeps its dialog whatever this preference says.
 */
export function useDirectDiscard({
  controller,
  projectPath,
  sessionEpoch,
  t,
  onBegin,
  onFinish,
  onMutationCompleted,
  onPhaseChange,
}: {
  controller: ChangesController;
  projectPath: string;
  sessionEpoch: string;
  t: Translations;
  /** Claims the session's mutation slot, exactly as opening the dialog does.
   * False means another operation owns it and this one must not start. */
  onBegin: () => boolean;
  onFinish: () => void;
  onMutationCompleted: () => void;
  onPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
}): {
  outcome: DirectDiscardOutcome | null;
  discard: (request: DirectDiscardRequest) => Promise<void>;
  undo: (recovery: DiscardRecovery) => Promise<void>;
  dismiss: () => void;
} {
  const [outcome, setOutcome] = useState<DirectDiscardOutcome | null>(null);

  const fail = (error: unknown): void => {
    setOutcome({ status: "error", message: localizeAppError(error, t, t.changesDiscardUnavailable) });
    onPhaseChange("error");
  };

  const discard = async (request: DirectDiscardRequest): Promise<void> => {
    if (!onBegin()) {
      return;
    }
    setOutcome({ status: "running" });
    onPhaseChange("planning");
    try {
      const plan = await controller.planDiscard(
        projectPath,
        sessionEpoch,
        request.mode === "selected" ? request.selectedPath : null,
      );
      onPhaseChange("executing");
      const result = await controller.discard(projectPath, sessionEpoch, plan.selectedPath, plan.stateToken);
      setOutcome({ status: "discarded", discardedFiles: result.discardedFiles, recovery: result.recovery });
      onPhaseChange("success");
      onMutationCompleted();
    } catch (error) {
      fail(error);
    } finally {
      onFinish();
    }
  };

  const undo = async (recovery: DiscardRecovery): Promise<void> => {
    if (!onBegin()) {
      return;
    }
    setOutcome({ status: "running" });
    onPhaseChange("executing");
    try {
      await controller.restoreDiscard(projectPath, sessionEpoch, recovery.recoveryId, recovery.stateToken);
      setOutcome({ status: "restored", restoredFiles: recovery.fileCount });
      onPhaseChange("success");
      onMutationCompleted();
    } catch (error) {
      fail(error);
    } finally {
      onFinish();
    }
  };

  return { outcome, discard, undo, dismiss: () => setOutcome(null) };
}
