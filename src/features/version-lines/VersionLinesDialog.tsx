import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, GitBranch, LoaderCircle, PenLine, Trash2, TriangleAlert } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { useModalFocus } from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui";
import type {
  CreateVersionLinePlan,
  DeleteVersionLinePlan,
  DeleteVersionLineResult,
  RenameVersionLinePlan,
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
// Rename a version line
// ---------------------------------------------------------------------------

type RenameState =
  | { status: "editing" }
  | { status: "planning" }
  | { status: "plan-error"; error: unknown }
  | { status: "renaming" }
  | { status: "error"; error: unknown };

/** Renaming is a local mutation and the only one on this screen that cannot
 * lose anything: the saved versions keep their commits and only the name over
 * them moves. So there is no plan-then-confirm step to read — the field is the
 * dialog, and the plan is fetched and executed by the same click.
 *
 * The published copy is the one consequence worth stating, because Git does
 * not rename it and the line goes on tracking its old remote name. */
export function RenameVersionLineDialog({
  isOpen,
  projectPath,
  sessionEpoch,
  target,
  upstream,
  onClose,
  onRenamed,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  target: string;
  /** What the line tracks, from the list's own snapshot. Shown as the note
   * under the field so the consequence is readable before the click, not
   * after it. */
  upstream: string | null;
  onClose: () => void;
  /** The snapshot the rename returned, and the name it was given — the
   * caller uses it to keep the selection on this line. */
  onRenamed: (snapshot: VersionLinesSnapshot, newName: string) => void;
  onPhaseChange?: (phase: VersionLineOperationPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(target);
  const [state, setState] = useState<RenameState>({ status: "editing" });
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

  const selectedOnceRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(target);
    setState({ status: "editing" });
    selectedOnceRef.current = false;
  }, [isOpen, target]);

  if (!isOpen) {
    return null;
  }

  const isBusy = state.status === "planning" || state.status === "renaming";
  isBusyRef.current = isBusy;
  const trimmed = name.trim();
  const unchanged = trimmed === target;
  const canSubmit = trimmed.length > 0 && !unchanged && !isBusy;

  function requestClose(): void {
    if (!isBusy) onClose();
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    const newName = trimmed;
    setState({ status: "planning" });
    onPhaseChangeRef.current?.("planning");
    versionLinesPort
      .planRename({ projectId: projectPath, sessionEpoch, name: target, newName })
      .then((plan: RenameVersionLinePlan) => {
        setState({ status: "renaming" });
        onPhaseChangeRef.current?.("executing");
        return versionLinesPort.rename({
          projectId: projectPath,
          sessionEpoch,
          name: target,
          newName,
          stateToken: plan.stateToken,
        });
      })
      .then((snapshot) => {
        onPhaseChangeRef.current?.("success");
        // No success screen: the list behind this dialog is the confirmation,
        // and it already shows the new name.
        onRenamed(snapshot, newName);
      })
      .catch((error: unknown) => {
        setState({ status: "plan-error", error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const error = "error" in state ? state.error : null;

  return (
    <div className="save-version-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="save-version-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-version-line-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="rename-version-line-title">{t.renameVersionLineTitle(target)}</h2>
        <form onSubmit={handleSubmit}>
          <label className="text-field">
            <span>{t.renameVersionLineNameLabel}</span>
            {/* `data-autofocus` is how a dialog names its landing point — the
                shared modal focus would otherwise land on Cancel. The whole
                name is selected the first time it lands, and only then:
                renaming is usually replacing, but a click into the middle of
                the field later is a caret, not a request to start over. */}
            <input
              ref={inputRef}
              data-autofocus
              type="text"
              value={name}
              spellCheck={false}
              autoComplete="off"
              disabled={isBusy}
              onFocus={(event) => {
                if (selectedOnceRef.current) return;
                selectedOnceRef.current = true;
                event.currentTarget.select();
              }}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="save-version-note">{t.renameVersionLineNote}</p>
          {upstream && <p className="save-version-note">{t.renameVersionLineUpstreamNote(upstream)}</p>}

          {error !== null && <ErrorBanner error={error} t={t} />}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
              {t.commonCancel}
            </button>
            <button className="primary-button" type="submit" disabled={!canSubmit}>
              {isBusy ? (
                <>
                  <LoaderCircle aria-hidden="true" className="icon--spinning" />
                  {t.renameVersionLineRenaming}
                </>
              ) : (
                <>
                  <PenLine aria-hidden="true" />
                  {t.renameVersionLineConfirm}
                </>
              )}
            </button>
          </div>
        </form>
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
  | { status: "success"; result: DeleteVersionLineResult };

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
  /* On by default when there is a published copy: leaving the remote branch
     behind is what makes "delete this line" only half true, and it is the
     tidying the user came here for. Still a visible, single-click opt-out —
     removing a shared branch is not something to do silently. */
  const [deleteRemote, setDeleteRemote] = useState(true);
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
    setDeleteRemote(true);
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
      deleteRemote: plan.published !== null && deleteRemote,
      stateToken: plan.stateToken,
    })
      .then((result) => {
        setState({ status: "success", result });
        onPhaseChangeRef.current?.("success");
        onDeleted(result.snapshot);
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
    blockedReason === "version_line_is_default" ||
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
                      : blockedReason === "version_line_is_default"
                        ? t.deleteVersionLineBlockedDefaultLead
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
              {/* The published copy, and the one decision this dialog asks for.
                  A line deleted only here is still on everyone else's screen,
                  which is why it is on by default; it is a checkbox and not a
                  silent side effect because it changes what the team sees. */}
              {plan.published && (
                <label className="version-lines-checkbox">
                  <input
                    className="app-checkbox"
                    type="checkbox"
                    checked={deleteRemote}
                    disabled={isBusy}
                    onChange={(event) => setDeleteRemote(event.target.checked)}
                  />
                  <span>
                    <strong>{t.deleteVersionLineRemoteLabel(plan.published.shortName)}</strong>
                    <span className="save-version-note">
                      {deleteRemote
                        ? t.deleteVersionLineRemoteOnNote
                        : t.deleteVersionLineRemoteOffNote(plan.published.shortName)}
                    </span>
                  </span>
                </label>
              )}
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
          <>
            {/* The local line is gone whatever the remote said, so a refusal
                out there is reported as a fact about the remote rather than as
                a failure of the whole operation. */}
            {state.result.remoteError ? (
              <div className="save-version-summary" role="status">
                <p>{t.deleteVersionLineRemoteFailedLead}</p>
                <p className="save-version-note">
                  {localizeAppError(state.result.remoteError, t, t.deleteVersionLineRemoteFailedLead)}
                </p>
              </div>
            ) : (
              state.result.remoteDeleted === true && (
                <div className="save-version-summary" role="status">
                  <p>{t.deleteVersionLineRemoteDoneLead}</p>
                </div>
              )
            )}
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={onClose}>
                {t.deleteVersionLineDone}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
