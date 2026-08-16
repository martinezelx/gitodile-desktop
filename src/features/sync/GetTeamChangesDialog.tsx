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
  History,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { autoHideScrollbarProps, useModalFocus } from "../../shared/ui";
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

const PHASES: GetTeamChangesPhase[] = [
  "checkingTeam",
  "checkingLocalSafety",
  "creatingRecovery",
  "updatingFilesAndHistory",
  "verifying",
];

function categoryIcon(category: IncomingFileCategory): React.JSX.Element {
  switch (category) {
    case "added": return <FilePlus2 />;
    case "deleted": return <FileMinus />;
    case "renamed": return <FileArchive />;
    case "modified": return <FilePenLine />;
  }
}

function PhaseProgress({ phase }: { phase: GetTeamChangesPhase }): React.JSX.Element {
  const { t } = useLanguage();
  const current = PHASES.indexOf(phase);
  const labels: Record<GetTeamChangesPhase, string> = {
    checkingTeam: t.getTeamPhaseTeam,
    checkingLocalSafety: t.getTeamPhaseSafety,
    creatingRecovery: t.getTeamPhaseRecovery,
    updatingFilesAndHistory: t.getTeamPhaseUpdating,
    verifying: t.getTeamPhaseVerifying,
  };
  return (
    <ol
      className="get-team-phases"
      aria-label={t.getTeamProgressLabel}
      aria-live="polite"
      aria-atomic="false"
    >
      {PHASES.map((item, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            key={item}
            className={active ? "get-team-phases__item--active" : complete ? "get-team-phases__item--complete" : undefined}
            aria-current={active ? "step" : undefined}
          >
            <span aria-hidden="true">
              {complete ? <Check /> : active ? <LoaderCircle className="icon--spinning" /> : null}
            </span>
            {labels[item]}
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

      <div className="get-team-plan__assurances">
        <section>
          <span className="get-team-plan__assurance-icon" aria-hidden="true"><GitBranch /></span>
          <div>
            <h3>{t.getTeamDestinationTitle}</h3>
            <p>{t.getTeamDestinationDescription(plan.branch, plan.target.remote, plan.target.destinationBranch)}</p>
          </div>
        </section>
        <section>
          <span className="get-team-plan__assurance-icon" aria-hidden="true"><ArrowDownToLine /></span>
          <div>
            <h3>{t.getTeamFastForwardTitle}</h3>
            <p>{t.getTeamFastForwardDescription}</p>
          </div>
        </section>
        <section>
          <span className="get-team-plan__assurance-icon" aria-hidden="true"><ShieldCheck /></span>
          <div>
            <h3>{t.getTeamRecoveryTitle}</h3>
            <p>{t.getTeamRecoveryDescription(plan.recovery.retentionLimit)}</p>
          </div>
        </section>
      </div>

      <p className="get-team-plan__local-note">
        <History aria-hidden="true" />
        {t.getTeamLocalConsequences}
      </p>

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
}: {
  isOpen: boolean;
  controller: SyncController;
  projectPath: string;
  sessionEpoch: string;
  onClose: () => void;
  onApplied: (result: GetTeamChangesResult) => Promise<void>;
  onPhaseChange: (phase: "planning" | "executing" | "verifying" | "uncertain" | "error" | "success") => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
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
    }).catch((error: unknown) => {
      setState({ status: "execution-error", plan, error });
      phaseRef.current("error");
    });
  };

  const currentPhase = state.status === "planning" || state.status === "executing" ? state.phase : null;
  return (
    <div className="get-team-backdrop" role="presentation" onMouseDown={requestClose}>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        ref={dialogRef}
        className="get-team-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-team-dialog-title"
        aria-describedby="get-team-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="get-team-dialog__header">
          <span aria-hidden="true"><ArrowDownToLine /></span>
          <div>
            <h2 id="get-team-dialog-title">
              {state.status === "success" ? t.getTeamSuccessTitle : state.status === "uncertain" ? t.getTeamUncertainTitle : t.getTeamDialogTitle}
            </h2>
            <p id="get-team-dialog-description">
              {state.status === "success" ? t.getTeamSuccessDescription(state.result.receivedCount) : state.status === "uncertain" ? t.getTeamUncertainDescription : t.getTeamDialogDescription}
            </p>
          </div>
        </header>

        {currentPhase && <PhaseProgress phase={currentPhase} />}

        {state.status === "blocked" && (
          <div className="get-team-message get-team-message--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <h3>{isAppError(state.error) && state.error.code === "diverged_histories" ? t.getTeamDivergedTitle : t.getTeamBlockedTitle}</h3>
              <p>{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
              {isAppError(state.error) && state.error.code === "diverged_histories" && <p>{t.getTeamDivergedNoRetry}</p>}
            </div>
          </div>
        )}

        {plan && state.status !== "success" && state.status !== "uncertain" && <PlanContent plan={plan} />}

        {state.status === "execution-error" && (
          <div className="get-team-message get-team-message--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <p>{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
          </div>
        )}

        {state.status === "uncertain" && (
          <div className="get-team-message get-team-message--warning" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <p>{t.getTeamUncertainInstructions}</p>
              <code>{state.result.recovery.reference}</code>
              {state.result.observedHead && <p>{t.getTeamObservedHead}: <code>{state.result.observedHead}</code></p>}
            </div>
          </div>
        )}

        {state.status === "success" && (
          <div className="get-team-message get-team-message--success" role="status">
            <ShieldCheck aria-hidden="true" />
            <div>
              <p>{t.getTeamSuccessRecovery(state.result.recovery.retentionLimit)}</p>
              <code>{state.result.recovery.reference}</code>
            </div>
          </div>
        )}

        <div className="dialog-actions get-team-dialog__actions">
          {state.status === "success" || state.status === "uncertain" ? (
            <button className="primary-button" type="button" onClick={requestClose}>{t.getTeamDone}</button>
          ) : (
            <>
              <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>{t.commonCancel}</button>
              {state.status === "ready" && (
                <button className="primary-button" type="button" onClick={execute}>
                  <ArrowDownToLine aria-hidden="true" />{t.getTeamConfirm}
                </button>
              )}
              {state.status === "execution-error" && (
                <button className="primary-button" type="button" onClick={replan}>{t.getTeamReviewUpdatedPlan}</button>
              )}
              {canRetryBlocked && (
                <button className="primary-button" type="button" onClick={replan}>{t.getTeamTryAgain}</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
