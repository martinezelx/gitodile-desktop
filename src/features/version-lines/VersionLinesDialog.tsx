import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, GitBranch, LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { useModalFocus } from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui";
import type {
  CreateVersionLinePlan,
  DeleteVersionLinePlan,
  SwitchVersionLinePlan,
  VersionLinesSnapshot,
} from "./domain";
import { versionLinesPort } from "./tauriAdapter";

type VersionLineOperationPhase = "planning" | "executing" | "error" | "success";

function FailureDetail({ error, t }: { error: unknown; t: Translations }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!isAppError(error) || !error.detail) {
    return null;
  }
  return (
    <div className="save-version-detail">
      <button type="button" className="save-version-detail__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? t.saveVersionHideDetail : t.saveVersionShowDetail}
      </button>
      {expanded && (
        <div>
          <p className="save-version-detail__heading">{t.saveVersionDetailHeading}</p>
          <pre
            {...autoHideScrollbarProps<HTMLPreElement>()}
            className="save-version-detail__body auto-hide-scrollbar"
          >
            {error.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ error, t }: { error: unknown; t: Translations }): React.JSX.Element {
  return (
    <div>
      <p className="save-version-error" role="alert">
        <CircleAlert aria-hidden="true" />
        {localizeAppError(error, t, t.errorGitCommandFailed)}
      </p>
      <FailureDetail error={error} t={t} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create a version line
// ---------------------------------------------------------------------------

type CreateState =
  | { status: "form" }
  | { status: "planning" }
  | { status: "confirm"; plan: CreateVersionLinePlan }
  | { status: "creating"; plan: CreateVersionLinePlan }
  | { status: "form-error"; error: unknown }
  | { status: "success"; snapshot: VersionLinesSnapshot; name: string; switched: boolean };

export function CreateVersionLineDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  /** Detached `HEAD`, or explicitly invoked to carry unsaved work: the
   * switch choice is locked on and explained rather than offered. */
  forceSwitch,
  onClose,
  onCreated,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  forceSwitch?: boolean;
  onClose: () => void;
  onCreated: (snapshot: VersionLinesSnapshot) => void;
  onPhaseChange?: (phase: VersionLineOperationPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [switchChoice, setSwitchChoice] = useState(true);
  const [state, setState] = useState<CreateState>({ status: "form" });
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

  useEffect(() => {
    if (isOpen) {
      setName("");
      setSwitchChoice(true);
      setState({ status: "form" });
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const isBusy = state.status === "planning" || state.status === "creating";
  isBusyRef.current = isBusy;
  const effectiveSwitch = Boolean(forceSwitch) || switchChoice;

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      nameRef.current?.focus();
      return;
    }
    setState({ status: "planning" });
    onPhaseChangeRef.current?.("planning");
    try {
      const plan = await versionLinesPort.planCreate({
        projectId: projectPath,
        sessionEpoch,
        name: trimmed,
        switchToNew: effectiveSwitch,
      });
      if (!plan.requiresConfirmation) {
        await execute(plan);
        return;
      }
      setState({ status: "confirm", plan });
    } catch (error) {
      setState({ status: "form-error", error });
      onPhaseChangeRef.current?.("error");
    }
  }

  async function execute(plan: CreateVersionLinePlan): Promise<void> {
    setState({ status: "creating", plan });
    onPhaseChangeRef.current?.("executing");
    try {
      const snapshot = await versionLinesPort.create({
        projectId: projectPath,
        sessionEpoch,
        name: plan.name,
        switchToNew: plan.willSwitch,
        stateToken: plan.stateToken,
      });
      setState({ status: "success", snapshot, name: plan.name, switched: plan.willSwitch });
      onPhaseChangeRef.current?.("success");
      onCreated(snapshot);
    } catch (error) {
      setState({ status: "form-error", error });
      onPhaseChangeRef.current?.("error");
    }
  }

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="save-version-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-version-line-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="create-version-line-title">
          {state.status === "success" ? t.createVersionLineSuccessTitle : t.createVersionLineTitle}
        </h2>

        {state.status === "success" ? (
          <>
            <p>{state.name}</p>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={onClose}>
                {t.createVersionLineDone}
              </button>
            </div>
          </>
        ) : state.status === "confirm" || state.status === "creating" ? (
          <>
            <div className="save-version-summary">
              <p>{state.plan.summary}</p>
              {state.plan.risks.map((risk) => (
                <p key={risk} className="save-version-note">
                  {risk}
                </p>
              ))}
            </div>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setState({ status: "form" })}
                disabled={isBusy}
              >
                {t.commonCancel}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void execute(state.plan)}
                disabled={isBusy}
              >
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.createVersionLineCreating}
                  </>
                ) : (
                  <>
                    <GitBranch aria-hidden="true" />
                    {t.createVersionLineConfirm}
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label className="text-field save-version-title">
              <span>{t.createVersionLineNameLabel}</span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                required
                disabled={isBusy}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.createVersionLineNamePlaceholder}
              />
            </label>

            {!forceSwitch && (
              <label className="version-lines-checkbox">
                <input
                  type="checkbox"
                  checked={switchChoice}
                  disabled={isBusy}
                  onChange={(event) => setSwitchChoice(event.target.checked)}
                />
                <span>{t.createVersionLineSwitchLabel}</span>
              </label>
            )}
            {forceSwitch && <p className="save-version-note">{t.createVersionLineDetachedNote}</p>}

            {state.status === "form-error" && <ErrorBanner error={state.error} t={t} />}

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="submit" disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.createVersionLineCreating}
                  </>
                ) : (
                  <>
                    <GitBranch aria-hidden="true" />
                    {t.createVersionLineConfirm}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch to an existing version line
// ---------------------------------------------------------------------------

type SwitchState =
  | { status: "loading" }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: SwitchVersionLinePlan }
  | { status: "switching"; plan: SwitchVersionLinePlan }
  | { status: "switch-error"; plan: SwitchVersionLinePlan; error: unknown }
  | { status: "success"; snapshot: VersionLinesSnapshot };

export function SwitchVersionLineDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  target,
  onClose,
  onSwitched,
  onSaveVersion,
  onCreateWithWork,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  target: string;
  onClose: () => void;
  onSwitched: (snapshot: VersionLinesSnapshot) => void;
  onSaveVersion: () => void;
  onCreateWithWork: () => void;
  onPhaseChange?: (phase: VersionLineOperationPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<SwitchState>({ status: "loading" });
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

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    onPhaseChangeRef.current?.("planning");
    versionLinesPort.planSwitch({ projectId: projectPath, sessionEpoch, target })
      .then((plan) => {
        if (!cancelled) {
          setState({ status: "ready", plan });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "blocked", error });
          onPhaseChangeRef.current?.("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath, sessionEpoch, target, retryToken]);

  if (!isOpen) {
    return null;
  }

  const isBusy = state.status === "switching";
  isBusyRef.current = isBusy;
  const isDirty = state.status === "blocked" && isAppError(state.error) && state.error.code === "dirty_working_tree";

  function requestClose(): void {
    if (!isBusy) {
      onClose();
    }
  }

  function handleConfirm(): void {
    if (state.status !== "ready") {
      return;
    }
    const plan = state.plan;
    setState({ status: "switching", plan });
    onPhaseChangeRef.current?.("executing");
    versionLinesPort.switch({
      projectId: projectPath,
      sessionEpoch,
      target: plan.to,
      stateToken: plan.stateToken,
    })
      .then((snapshot) => {
        setState({ status: "success", snapshot });
        onPhaseChangeRef.current?.("success");
        onSwitched(snapshot);
      })
      .catch((error: unknown) => {
        setState({ status: "switch-error", plan, error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const plan = "plan" in state ? state.plan : null;

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="save-version-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-version-line-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="switch-version-line-title">
          {state.status === "success" ? t.switchVersionLineSuccessTitle : t.switchVersionLineTitle(target)}
        </h2>

        {state.status === "loading" && (
          <div className="save-version-status" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            <p>{t.switchVersionLineLoading}</p>
          </div>
        )}

        {state.status === "blocked" && isDirty && (
          <>
            <p>{t.switchVersionLineDirtyDescription}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonCancel}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  onClose();
                  onSaveVersion();
                }}
              >
                {t.switchVersionLineSaveVersionAction}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  onClose();
                  onCreateWithWork();
                }}
              >
                {t.switchVersionLineNewLineAction}
              </button>
            </div>
          </>
        )}

        {state.status === "blocked" && !isDirty && (
          <>
            <ErrorBanner error={state.error} t={t} />
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
                {t.versionLinesRetry}
              </button>
            </div>
          </>
        )}

        {plan && state.status !== "success" && (
          <>
            <div className="save-version-summary">
              <p>{t.switchVersionLineChangedFiles(plan.changedFilesTotal)}</p>
              {plan.changedFilesTotal > plan.changedFiles.length && (
                <p className="save-version-note">
                  {t.switchVersionLineChangedFilesTruncated(plan.changedFiles.length, plan.changedFilesTotal)}
                </p>
              )}
              <p className="save-version-note">{plan.recovery}</p>
            </div>

            {state.status === "switch-error" && <ErrorBanner error={state.error} t={t} />}

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={handleConfirm} disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.switchVersionLineSwitching}
                  </>
                ) : (
                  <>
                    <GitBranch aria-hidden="true" />
                    {t.switchVersionLineConfirm}
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {state.status === "success" && (
          <div className="dialog-actions">
            <button className="primary-button" type="button" onClick={onClose}>
              {t.switchVersionLineDone}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Safely delete a local version line
// ---------------------------------------------------------------------------

type DeleteState =
  | { status: "loading" }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: DeleteVersionLinePlan }
  | { status: "deleting"; plan: DeleteVersionLinePlan }
  | { status: "delete-error"; plan: DeleteVersionLinePlan; error: unknown }
  | { status: "success"; snapshot: VersionLinesSnapshot };

export function DeleteVersionLineDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  target,
  onClose,
  onDeleted,
  onSwitchInstead,
  onOpenChanges,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  target: string;
  onClose: () => void;
  onDeleted: (snapshot: VersionLinesSnapshot) => void;
  /** Offered as the way forward when a line can't be deleted because its work
   * lives nowhere else: from that line you can publish or merge it, which is
   * exactly what unblocks the deletion. Absent, the dialog just explains. */
  onSwitchInstead?: () => void;
  /** Offered when an unfinished Git operation blocks every version-line
   * change: the Changes screen is the one place that shows which files are
   * in conflict, which is as far as GitOdile goes on conflicts today. */
  onOpenChanges?: () => void;
  onPhaseChange?: (phase: VersionLineOperationPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<DeleteState>({ status: "loading" });
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

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    onPhaseChangeRef.current?.("planning");
    versionLinesPort.planDelete({ projectId: projectPath, sessionEpoch, name: target })
      .then((plan) => {
        if (!cancelled) {
          setState({ status: "ready", plan });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "blocked", error });
          onPhaseChangeRef.current?.("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectPath, sessionEpoch, target, retryToken]);

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

  function handleConfirm(): void {
    if (state.status !== "ready") {
      return;
    }
    const plan = state.plan;
    setState({ status: "deleting", plan });
    onPhaseChangeRef.current?.("executing");
    versionLinesPort.delete({
      projectId: projectPath,
      sessionEpoch,
      name: plan.name,
      stateToken: plan.stateToken,
    })
      .then((snapshot) => {
        setState({ status: "success", snapshot });
        onPhaseChangeRef.current?.("success");
        onDeleted(snapshot);
      })
      .catch((error: unknown) => {
        setState({ status: "delete-error", plan, error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const plan = "plan" in state ? state.plan : null;
  // A refusal to delete is a normal, expected answer here — a line whose work
  // lives nowhere else *should* survive. Those cases get their own explanation
  // and a way forward instead of the generic red error banner, which is kept
  // for failures the user can only retry.
  const blockedReason =
    state.status === "blocked" && isAppError(state.error) ? state.error.code : null;
  const isExplainedBlock =
    blockedReason === "version_line_unique_work" ||
    blockedReason === "version_line_checked_out_elsewhere" ||
    blockedReason === "version_line_is_active" ||
    blockedReason === "git_operation_in_progress";

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="save-version-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-version-line-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-version-line-title">
          {state.status === "success"
            ? t.deleteVersionLineSuccessTitle
            : isExplainedBlock
              ? t.deleteVersionLineBlockedTitle(target)
              : t.deleteVersionLineTitle(target)}
        </h2>

        {state.status === "loading" && (
          <div className="save-version-status" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            <p>{t.versionLinesLoading}</p>
          </div>
        )}

        {state.status === "blocked" && isExplainedBlock && (
          <>
            <div className="save-version-summary" role="status">
              <p>
                {blockedReason === "version_line_unique_work"
                  ? t.deleteVersionLineBlockedUniqueLead
                  : blockedReason === "version_line_checked_out_elsewhere"
                    ? t.deleteVersionLineBlockedElsewhereLead
                    : blockedReason === "git_operation_in_progress"
                      ? t.deleteVersionLineBlockedOperationLead
                      : t.deleteVersionLineBlockedActiveLead}
              </p>
              {blockedReason === "git_operation_in_progress" && (
                <p className="save-version-note">{t.deleteVersionLineBlockedOperationNote}</p>
              )}
              {blockedReason === "version_line_unique_work" && (
                <ul className="delete-version-line-options">
                  <li>{t.deleteVersionLineBlockedUniqueOptionPublish}</li>
                  <li>{t.deleteVersionLineBlockedUniqueOptionMerge}</li>
                  <li>{t.deleteVersionLineBlockedUniqueOptionKeep}</li>
                </ul>
              )}
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonClose}
              </button>
              {blockedReason === "git_operation_in_progress" && onOpenChanges && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    onOpenChanges();
                  }}
                >
                  <TriangleAlert aria-hidden="true" />
                  {t.deleteVersionLineOpenChangesAction}
                </button>
              )}
              {blockedReason === "version_line_unique_work" && onSwitchInstead && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    onSwitchInstead();
                  }}
                >
                  <GitBranch aria-hidden="true" />
                  {t.deleteVersionLineSwitchAction}
                </button>
              )}
            </div>
          </>
        )}

        {state.status === "blocked" && !isExplainedBlock && (
          <>
            <ErrorBanner error={state.error} t={t} />
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
                {t.versionLinesRetry}
              </button>
            </div>
          </>
        )}

        {plan && state.status !== "success" && (
          <>
            <div className="save-version-summary">
              <p>{t.deleteVersionLineSafeLead}</p>
              <ul className="delete-version-line-options">
                {plan.retainedBy.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
              <p className="save-version-note">{t.deleteVersionLineWarning}</p>
            </div>

            {state.status === "delete-error" && <ErrorBanner error={state.error} t={t} />}

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={handleConfirm} disabled={isBusy}>
                {isBusy ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    {t.deleteVersionLineDeleting}
                  </>
                ) : (
                  <>
                    <Trash2 aria-hidden="true" />
                    {t.deleteVersionLineConfirm}
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {state.status === "success" && (
          <div className="dialog-actions">
            <button className="primary-button" type="button" onClick={onClose}>
              {t.deleteVersionLineDone}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
