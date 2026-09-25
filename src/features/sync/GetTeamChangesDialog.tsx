import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleAlert,
  FileArchive,
  FileMinus,
  FilePenLine,
  FilePlus2,
  GitBranch,
  Save,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, DialogFacts, autoHideScrollbarProps, useModalFocus, useToast } from "../../shared/ui";
import type { SyncController } from "./controller";
import type {
  GetTeamChangesPhase,
  GetTeamChangesPlan,
  GetTeamChangesResult,
  IncomingFileCategory,
} from "./domain";

type DialogState =
  | { status: "planning"; phase: GetTeamChangesPhase }
  | { status: "blocked"; error: unknown }
  | { status: "ready"; plan: GetTeamChangesPlan }
  | { status: "executing"; plan: GetTeamChangesPlan; phase: GetTeamChangesPhase }
  | { status: "success"; result: GetTeamChangesResult }
  | { status: "uncertain"; result: GetTeamChangesResult }
  | { status: "execution-error"; plan: GetTeamChangesPlan; error: unknown };

function categoryIcon(category: IncomingFileCategory): React.JSX.Element {
  switch (category) {
    case "added": return <FilePlus2 />;
    case "deleted": return <FileMinus />;
    case "renamed": return <FileArchive />;
    case "modified": return <FilePenLine />;
  }
}

/* Five phases on the wire, three steps on screen: the reader needs to know
   the remote is being read, a recovery point is being kept and files are
   changing — not which internal check runs in between. */
const STEPS: { phases: GetTeamChangesPhase[] }[] = [
  { phases: ["checkingTeam", "checkingLocalSafety"] },
  { phases: ["creatingRecovery"] },
  { phases: ["updatingFilesAndHistory", "verifying"] },
];

function PhaseProgress({ phase }: { phase: GetTeamChangesPhase }): React.JSX.Element {
  const { t } = useLanguage();
  const labels = [t.getTeamPhaseTeam, t.getTeamPhaseRecovery, t.getTeamPhaseUpdating];
  const current = STEPS.findIndex((step) => step.phases.includes(phase));
  return (
    <ol
      className="app-dialog__steps"
      aria-label={t.getTeamProgressLabel}
      aria-live="polite"
      aria-atomic="false"
    >
      {STEPS.map((_, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            key={index}
            className={`app-dialog__step${active ? " app-dialog__step--active" : complete ? " app-dialog__step--done" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="app-dialog__step-dot" aria-hidden="true">{complete && <Check />}</span>
            {labels[index]}
          </li>
        );
      })}
    </ol>
  );
}

function PlanContent({ plan }: { plan: GetTeamChangesPlan }): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <div className="get-team-plan">
      <div className="get-team-plan__lead">
        <section aria-labelledby="get-team-versions-title">
          <h3 id="get-team-versions-title">{t.getTeamIncomingVersions(plan.incomingCount)}</h3>
          <ul
            {...autoHideScrollbarProps<HTMLUListElement>()}
            className="get-team-version-list auto-hide-scrollbar"
          >
            {plan.incomingVersions.map((version) => (
              <li key={version.commit}>
                <span>{version.title}</span>
                {version.author && <small>{version.author}</small>}
                <code>{version.shortCommit}</code>
              </li>
            ))}
          </ul>
          {plan.versionsTruncated && (
            <p className="get-team-plan__bounded-note">{t.getTeamVersionsTruncated(plan.incomingVersions.length, plan.incomingCount)}</p>
          )}
        </section>

        <section aria-labelledby="get-team-files-title">
          <h3 id="get-team-files-title">{t.getTeamAffectedFiles(plan.fileImpact.totalCount)}</h3>
          <ul
            {...autoHideScrollbarProps<HTMLUListElement>()}
            className="get-team-file-list auto-hide-scrollbar"
          >
            {plan.fileImpact.files.map((file) => (
              <li key={`${file.originalPath ?? ""}\0${file.path}`}>
                <span className="get-team-file-list__icon" aria-hidden="true">{categoryIcon(file.category)}</span>
                <span className="get-team-file-list__path">
                  {file.originalPath ? <><s>{file.originalPath}</s><span>{file.path}</span></> : file.path}
                </span>
                <span className="get-team-file-list__kind">
                  {file.binary ? t.getTeamBinaryFile : t.getTeamFileCategory[file.category]}
                </span>
              </li>
            ))}
          </ul>
          {plan.fileImpact.isTruncated && (
            <p className="get-team-plan__bounded-note">{t.getTeamFilesTruncated(plan.fileImpact.files.length, plan.fileImpact.totalCount)}</p>
          )}
        </section>
      </div>

      {/* Two lines, not a grid of cards: what happens to the line, and what
          stays safe. The mechanism is in the technical details. */}
      <DialogFacts
        facts={[
          { icon: <GitBranch />, text: t.getTeamLineCatchesUp(plan.branch) },
          { icon: <ShieldCheck />, text: t.getTeamRecoveryFirst, safe: true },
        ]}
      />

      <details className="get-team-technical">
        <summary><ChevronDown aria-hidden="true" />{t.syncTechnicalDetails}</summary>
        <dl>
          <div><dt>{t.getTeamOperationKind}</dt><dd>{plan.operationKind}</dd></div>
          <div><dt>{t.syncRemote}</dt><dd>{plan.target.remote}</dd></div>
          <div><dt>{t.syncDestination}</dt><dd>{plan.target.destinationBranch}</dd></div>
          <div><dt>{t.syncTrackingRef}</dt><dd>{plan.trackingRef}</dd></div>
          <div><dt>{t.syncLocalCommit}</dt><dd>{plan.localCommit}</dd></div>
          <div><dt>{t.syncRemoteCommit}</dt><dd>{plan.remoteCommit}</dd></div>
          <div><dt>{t.getTeamRecoveryReference}</dt><dd>{plan.recovery.reference}</dd></div>
          <div><dt>{t.getTeamStateToken}</dt><dd>{plan.stateToken}</dd></div>
        </dl>
        <p>{t.getTeamTechnicalGuarantees}</p>
      </details>
    </div>
  );
}

function deterministicBlock(error: unknown): boolean {
  return isAppError(error) && [
    "diverged_histories",
    "nothing_to_get",
    "remote_ref_missing",
    "invalid_remote_configuration",
    "detached_head",
    "unborn_branch_no_version",
    "dirty_working_tree",
    "incoming_tracked_change_collision",
    "incoming_path_collision",
    "git_operation_in_progress",
  ].includes(error.code);
}

export function GetTeamChangesDialog({
  isOpen,
  controller,
  projectPath,
  sessionEpoch,
  onClose,
  onApplied,
  onPhaseChange,
  onSaveVersion,
}: {
  isOpen: boolean;
  controller: SyncController;
  projectPath: string;
  sessionEpoch: string;
  onClose: () => void;
  onApplied: (result: GetTeamChangesResult) => Promise<void>;
  onPhaseChange: (phase: "planning" | "executing" | "verifying" | "uncertain" | "error" | "success") => void;
  /** Offered when unsaved work collides with what is coming in: saving it is
   * the way through, so the dialog hands over to Save version. */
  onSaveVersion?: () => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const phaseRef = useRef(onPhaseChange);
  const busyRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<DialogState>({ status: "planning", phase: "checkingTeam" });
  closeRef.current = onClose;
  phaseRef.current = onPhaseChange;

  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? next(true) : next;
    if (!value && !busyRef.current) closeRef.current();
  }, []);
  useModalFocus(isOpen, dialogRef, setOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    phaseRef.current("planning");
    setState({ status: "planning", phase: "checkingTeam" });
    controller.planGet(
      { projectId: projectPath, sessionEpoch },
      (phase) => !cancelled && setState({ status: "planning", phase }),
    ).then((plan) => {
      if (!cancelled) setState({ status: "ready", plan });
    }).catch((error: unknown) => {
      if (!cancelled) {
        setState({ status: "blocked", error });
        phaseRef.current("error");
      }
    });
    return () => { cancelled = true; };
  }, [controller, isOpen, projectPath, retryToken, sessionEpoch]);

  if (!isOpen) return null;
  const isBusy = state.status === "executing";
  busyRef.current = isBusy;
  const plan = "plan" in state ? state.plan : null;
  const canRetryBlocked = state.status === "blocked" && !deterministicBlock(state.error);

  const requestClose = (): void => {
    if (!isBusy) onClose();
  };
  const replan = (): void => {
    phaseRef.current("planning");
    setRetryToken((value) => value + 1);
  };
  const execute = (): void => {
    if (!plan) return;
    phaseRef.current("executing");
    setState({ status: "executing", plan, phase: "checkingTeam" });
    controller.get({
      projectId: projectPath,
      sessionEpoch,
      stateToken: plan.stateToken,
      recoveryReference: plan.recovery.reference,
      onProgress: (phase) => {
        setState({ status: "executing", plan, phase });
        phaseRef.current(phase === "verifying" ? "verifying" : "executing");
      },
    }).then(async (result) => {
      if (result.outcome === "uncertain") {
        setState({ status: "uncertain", result });
        phaseRef.current("uncertain");
        return;
      }
      await onApplied(result);
      setState({ status: "success", result });
      phaseRef.current("success");
      // Nothing left to decide, so the result is a toast rather than a screen
      // to dismiss. The recovery point is still kept, as before.
      showToast({ icon: <ArrowDownToLine />, message: t.getTeamSuccessToast(result.receivedCount) });
      closeRef.current();
    }).catch((error: unknown) => {
      setState({ status: "execution-error", plan, error });
      phaseRef.current("error");
    });
  };

  const currentPhase = state.status === "planning" || state.status === "executing" ? state.phase : null;
  const blockedCode = state.status === "blocked" && isAppError(state.error) ? state.error.code : null;
  const isDiverged = blockedCode === "diverged_histories";
  // Unsaved work in the way is lifted by saving it. A local file the update
  // would overwrite is not (it has to be moved), so it keeps its own message.
  const isCollision = blockedCode === "incoming_tracked_change_collision" || blockedCode === "dirty_working_tree";

  // A blocked or uncertain result is a short message, not a plan: the small
  // shell, a status glyph, one sentence and the way out.
  if (state.status === "blocked" || state.status === "uncertain") {
    const title = state.status === "uncertain"
      ? t.getTeamUncertainTitle
      : isDiverged ? t.getTeamDivergedTitle : isCollision ? t.getTeamSaveFirstTitle : t.getTeamBlockedTitle;
    return (
      <Dialog
        size="s"
        role="alertdialog"
        title={title}
        titleId="get-team-dialog-title"
        descriptionId="get-team-dialog-description"
        icon={<CircleAlert />}
        tone={isDiverged ? "danger" : "warning"}
        onClose={requestClose}
        closeLabel={t.commonClose}
        dialogRef={dialogRef}
      >
        <p className="app-dialog__text" id="get-team-dialog-description">
          {state.status === "uncertain"
            ? t.getTeamUncertainInstructions
            : isDiverged
              ? t.getTeamDivergedNoRetry
              : isCollision
                ? blockedCode === "dirty_working_tree" ? t.getTeamDirtyBody : t.getTeamSaveFirstBody
                : localizeAppError(state.error, t, t.errorGitCommandFailed)}
        </p>
        {state.status === "uncertain" && (
          <details className="app-dialog__details">
            <summary>{t.syncTechnicalDetails}</summary>
            <pre>
              {`${t.getTeamRecoveryReference}: ${state.result.recovery.reference}`}
              {state.result.observedHead ? `\n${t.getTeamObservedHead}: ${state.result.observedHead}` : ""}
            </pre>
          </details>
        )}
        <div className="dialog-actions">
          {isCollision && onSaveVersion ? (
            <>
              <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
              <button className="primary-button" type="button" onClick={onSaveVersion}>
                <Save aria-hidden="true" />{t.getTeamSaveVersion}
              </button>
            </>
          ) : canRetryBlocked ? (
            <>
              <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
              <button className="primary-button" type="button" onClick={replan}>{t.getTeamTryAgain}</button>
            </>
          ) : (
            <button className="primary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      size="l"
      title={t.getTeamDialogTitle}
      titleId="get-team-dialog-title"
      subtitle={<span id="get-team-dialog-description">{t.getTeamDialogDescription}</span>}
      descriptionId="get-team-dialog-description"
      icon={<ArrowDownToLine />}
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
      className="get-team-dialog auto-hide-scrollbar"
      bodyProps={autoHideScrollbarProps<HTMLDivElement>()}
    >
      {currentPhase && <PhaseProgress phase={currentPhase} />}

      {plan && state.status !== "success" && <PlanContent plan={plan} />}

      {state.status === "execution-error" && (
        <DialogBanner tone="danger" icon={<CircleAlert />}>
          <p role="alert">{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
        </DialogBanner>
      )}

      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>{t.commonCancel}</button>
        {state.status === "ready" && (
          <button className="primary-button" type="button" onClick={execute}>
            <ArrowDownToLine aria-hidden="true" />{t.getTeamConfirm}
          </button>
        )}
        {state.status === "execution-error" && (
          <button className="primary-button" type="button" onClick={replan}>{t.getTeamReviewUpdatedPlan}</button>
        )}
      </div>
    </Dialog>
  );
}
