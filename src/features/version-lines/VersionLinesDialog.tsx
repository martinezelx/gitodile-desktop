import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, GitBranch, LoaderCircle, ShieldCheck, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { localizeAppError, isAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, moveFocusWithinRadioGroup, useModalFocus, useToast } from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui";
import type {
  CreateVersionLinePlan,
  DeleteVersionLinePlan,
  DeleteVersionLineResult,
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
    <DialogBanner tone="danger" icon={<CircleAlert />}>
      <p role="alert">{localizeAppError(error, t, t.errorGitCommandFailed)}</p>
      <FailureDetail error={error} t={t} />
    </DialogBanner>
  );
}

/** A ref as the reader knows it: the line's own name, not its path in Git. */
function lineName(ref: string): string {
  return ref.replace(/^refs\/(heads|remotes|tags)\//, "");
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
  /** A saved version the line should start at, chosen from History. Absent
   * means the project's current commit, which is what this dialog has always
   * meant. */
  startVersion,
  onClose,
  onCreated,
  onPhaseChange,
}: {
  isOpen: boolean;
  projectPath: string;
  sessionEpoch: string;
  forceSwitch?: boolean;
  startVersion?: { commit: string; shortCommit: string; subject: string } | null;
  onClose: () => void;
  onCreated: (snapshot: VersionLinesSnapshot) => void;
  onPhaseChange?: (phase: VersionLineOperationPhase) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  useInstallDraftBlocker(
    `create-version-line:${projectPath}`,
    t.createVersionLineTitle,
    isOpen && name.trim() !== "",
  );
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
      // A line created from a version somewhere back in the history is a place
      // to go later, not a move the reader asked for by picking the version.
      // Starting where you are still offers to take you there.
      setSwitchChoice(!startVersion);
      setState({ status: "form" });
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [isOpen, startVersion]);

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
        startCommit: startVersion?.commit ?? null,
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
        startCommit: plan.fromSavedVersion ? plan.startingCommit : null,
        stateToken: plan.stateToken,
      });
      setState({ status: "success", snapshot, name: plan.name, switched: plan.willSwitch });
      onPhaseChangeRef.current?.("success");
      onCreated(snapshot);
      // Nothing left to decide: a toast. The host closes the dialog on
      // `onCreated`, the way it always has.
      showToast({ icon: <GitBranch />, message: t.createVersionLineToast(plan.name, plan.willSwitch) });
    } catch (error) {
      setState({ status: "form-error", error });
      onPhaseChangeRef.current?.("error");
    }
  }

  return (
    <Dialog
      size="s"
      title={t.createVersionLineTitle}
      titleId="create-version-line-title"
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
    >
      {state.status === "confirm" || state.status === "creating" ? (
        <>
          <p className="app-dialog__text">{state.plan.summary}</p>
          {state.plan.risks.map((risk) => (
            <p key={risk} className="app-dialog__text">{risk}</p>
          ))}
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
        <form className="version-line-form" onSubmit={(event) => void handleSubmit(event)}>
          {/* Said before the name is typed, because it is the fact that makes
              this creation different from every other one. */}
          {startVersion && (
            <p className="app-dialog__text">
              {t.createVersionLineStartsAt(startVersion.shortCommit, startVersion.subject)}
            </p>
          )}
          <label className="text-field">
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
            <label className="app-dialog__check">
              <input
                className="app-checkbox"
                type="checkbox"
                checked={switchChoice}
                disabled={isBusy}
                onChange={(event) => setSwitchChoice(event.target.checked)}
              />
              {t.createVersionLineSwitchLabel}
            </label>
          )}
          {forceSwitch && <p className="app-dialog__text">{t.createVersionLineDetachedNote}</p>}

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
    </Dialog>
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
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<SwitchState>({ status: "loading" });
  /* With unsaved changes there are two ways through, offered as a choice
     rather than as three buttons side by side. */
  const [dirtyChoice, setDirtyChoice] = useState<"save" | "new-line">("save");
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
        // The host closes the dialog on `onSwitched`.
        showToast({ icon: <GitBranch />, message: t.switchVersionLineToast(plan.to) });
      })
      .catch((error: unknown) => {
        setState({ status: "switch-error", plan, error });
        onPhaseChangeRef.current?.("error");
      });
  }

  const plan = "plan" in state ? state.plan : null;

  return (
    <Dialog
      size="s"
      title={t.switchVersionLineTitle(target)}
      titleId="switch-version-line-title"
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
    >
      {state.status === "loading" && (
        <p className="app-dialog__note" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          {t.switchVersionLineLoading}
        </p>
      )}

      {state.status === "blocked" && isDirty && (
        <>
          <p className="app-dialog__text">{t.switchVersionLineDirtyDescription}</p>
          <div
            className="choice-list"
            role="radiogroup"
            aria-label={t.switchVersionLineDirtyDescription}
            onKeyDown={moveFocusWithinRadioGroup}
          >
            {([
              ["save", t.switchVersionLineDirtySaveTitle, t.switchVersionLineDirtySaveNote],
              ["new-line", t.switchVersionLineDirtyNewTitle, t.switchVersionLineDirtyNewNote],
            ] as const).map(([value, label, note]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={dirtyChoice === value}
                tabIndex={dirtyChoice === value ? 0 : -1}
                // The arrows move focus and the choice with it, so the primary
                // action below always names what focus is on.
                onFocus={() => setDirtyChoice(value)}
                className={`choice-list__option${dirtyChoice === value ? " choice-list__option--active" : ""}`}
                onClick={() => setDirtyChoice(value)}
              >
                <span className="choice-list__label">{label}</span>
                <span className="choice-list__description">{note}</span>
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>
              {t.commonCancel}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onClose();
                if (dirtyChoice === "save") onSaveVersion();
                else onCreateWithWork();
              }}
            >
              {dirtyChoice === "save" ? t.switchVersionLineSaveVersionAction : t.switchVersionLineNewLineAction}
            </button>
          </div>
        </>
      )}

      {state.status === "blocked" && !isDirty && (
        <>
          <ErrorBanner error={state.error} t={t} />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>
              {t.commonClose}
            </button>
            <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
              {t.versionLinesRetry}
            </button>
          </div>
        </>
      )}

      {plan && state.status !== "success" && (
        <>
          <p className="app-dialog__text">{t.switchVersionLineChangedFiles(plan.changedFilesTotal)}</p>
          {plan.changedFilesTotal > plan.changedFiles.length && (
            <p className="app-dialog__text">
              {t.switchVersionLineChangedFilesTruncated(plan.changedFiles.length, plan.changedFilesTotal)}
            </p>
          )}
          {/* Written here from the plan's facts rather than taken from the
              plan's own English sentence: the reader's language decides it. */}
          <p className="app-dialog__note">
            <Undo2 aria-hidden="true" />
            {t.switchVersionLineRecoveryNote(plan.from)}
          </p>

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
    </Dialog>
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
  const showToast = useToast();
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
        // The local line is gone whatever the remote said, so a refusal out
        // there is reported as a fact about the remote, not as a failure.
        const extra = result.remoteError
          ? "remote-failed"
          : result.remoteDeleted === true
            ? "remote"
            : result.recoveryReference
              ? "recovery"
              : null;
        showToast({ icon: <Trash2 />, message: t.deleteVersionLineDeletedToast(plan.name, extra) });
        onCloseRef.current();
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

  const isConflictBlock = blockedReason === "git_operation_in_progress";

  return (
    <Dialog
      size="s"
      role={isExplainedBlock ? "alertdialog" : "dialog"}
      title={isExplainedBlock
        ? isConflictBlock ? t.deleteVersionLineConflictTitle : t.deleteVersionLineBlockedTitle
        : t.deleteVersionLineTitle(target)}
      titleId="delete-version-line-title"
      icon={isExplainedBlock ? isConflictBlock ? <CircleAlert /> : <TriangleAlert /> : undefined}
      tone="warning"
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
    >
      {state.status === "loading" && (
        <p className="app-dialog__note" role="status">
          <LoaderCircle aria-hidden="true" className="icon--spinning" />
          {t.versionLinesLoading}
        </p>
      )}

      {state.status === "blocked" && isExplainedBlock && (
        <>
          <p className="app-dialog__text" role="status">
            {blockedReason === "version_line_unique_work"
              ? t.deleteVersionLineBlockedUniqueLead(target)
              : blockedReason === "version_line_checked_out_elsewhere"
                ? t.deleteVersionLineBlockedElsewhereLead
                : isConflictBlock
                  ? t.deleteVersionLineBlockedOperationLead(target)
                  : blockedReason === "version_line_is_default"
                    ? t.deleteVersionLineBlockedDefaultLead
                    : t.deleteVersionLineBlockedActiveLead}
          </p>
          {blockedReason === "version_line_unique_work" && (
            <ul className="delete-version-line-options">
              <li>{t.deleteVersionLineBlockedUniqueOptionPublish}</li>
              <li>{t.deleteVersionLineBlockedUniqueOptionMerge}</li>
              <li>{t.deleteVersionLineBlockedUniqueOptionKeep}</li>
            </ul>
          )}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose}>
              {t.commonClose}
            </button>
            {isConflictBlock && onOpenChanges && (
              <button className="primary-button" type="button" onClick={() => onOpenChanges()}>
                {t.deleteVersionLineOpenChangesAction}
              </button>
            )}
            {blockedReason === "version_line_unique_work" && onSwitchInstead && (
              <button className="primary-button" type="button" onClick={() => onSwitchInstead()}>
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
              {t.commonClose}
            </button>
            <button className="primary-button" type="button" onClick={() => setRetryToken((value) => value + 1)}>
              {t.versionLinesRetry}
            </button>
          </div>
        </>
      )}

      {plan && state.status !== "success" && (
        <>
          {/* Held by another line, the work is simply elsewhere. Held by none
              but copied into the main line, the originals are about to lose
              their last name — so the plan says where the work is and that a
              recovery point keeps the originals first. */}
          {plan.copiedInto ? (
            <>
              <p className="app-dialog__text">
                {t.deleteVersionLineCopiedLead(plan.copiedInto.base, plan.copiedInto.kind === "squash")}
              </p>
              <p className="app-dialog__note">
                <ShieldCheck aria-hidden="true" />
                {t.deleteVersionLineCopiedRecovery}
              </p>
            </>
          ) : (
            <p className="app-dialog__text">
              {t.deleteVersionLineSafeLead(lineName(plan.retainedBy[0] ?? ""))}
            </p>
          )}
          {/* The published copy, and the one decision this dialog asks for.
              A line deleted only here is still on everyone else's screen, which
              is why it is on by default; it is a checkbox and not a silent side
              effect because it changes what the team sees. */}
          {plan.published && (
            <label className="app-dialog__check app-dialog__check--block">
              <input
                className="app-checkbox"
                type="checkbox"
                checked={deleteRemote}
                disabled={isBusy}
                onChange={(event) => setDeleteRemote(event.target.checked)}
              />
              <span>
                <strong>{t.deleteVersionLineRemoteLabel}</strong>
                <small>{deleteRemote ? t.deleteVersionLineRemoteOnNote : t.deleteVersionLineRemoteOffNote}</small>
              </span>
            </label>
          )}

          {state.status === "delete-error" && <ErrorBanner error={state.error} t={t} />}

          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
              {t.commonCancel}
            </button>
            <button className="danger-button" type="button" onClick={handleConfirm} disabled={isBusy}>
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
    </Dialog>
  );
}
