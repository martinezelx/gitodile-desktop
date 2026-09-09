import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CloudDownload,
  FolderInput,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  Network,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { DialogCloseButton, FieldError, LoadingBar, useFieldErrors, useModalFocus } from "../../shared/ui";
import type { CloneAttempt, CloneController } from "./controller";
import {
  readLastCloneParent,
  writeLastCloneParent,
  type CloneProgressPhase,
  type CloneRequest,
  type CloneResult,
} from "./domain";

const PROGRESS_PHASES: CloneProgressPhase[] = [
  "preparing",
  "cloning",
  "sanitizingRemote",
  "verifying",
  "publishing",
  "finalizing",
];

type DialogStep =
  | "input"
  | "planning"
  | "preview"
  | "executing"
  | "cancelled"
  | "error"
  | "cleanup"
  | "opening"
  | "open-error";

export function CloneDialog({
  isOpen,
  controller,
  onClose,
  onVerifiedClone,
}: {
  isOpen: boolean;
  controller: CloneController;
  onClose: () => void;
  onVerifiedClone: (result: CloneResult) => Promise<void>;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeAfterCancelRef = useRef(false);
  const [source, setSource] = useState("");
  const [destinationParent, setDestinationParent] = useState(readLastCloneParent);
  const initialDestinationParent = useRef(destinationParent);
  const [destinationName, setDestinationName] = useState("");
  const [step, setStep] = useState<DialogStep>("input");
  const [attempt, setAttempt] = useState<CloneAttempt | null>(null);
  const [result, setResult] = useState<CloneResult | null>(null);
  const [phase, setPhase] = useState<CloneProgressPhase>("preparing");
  const [error, setError] = useState<unknown>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const { errors, formProps, fieldProps, validate, reset: resetFieldErrors } = useFieldErrors();
  useInstallDraftBlocker(
    "clone-project-dialog",
    "clone project details",
    isOpen &&
      (source.trim() !== "" ||
        destinationName.trim() !== "" ||
        destinationParent !== initialDestinationParent.current),
  );

  const resetTransientState = (): void => {
    setStep("input");
    setAttempt(null);
    setResult(null);
    setPhase("preparing");
    setError(null);
    setIsCancelling(false);
    setIsCleaning(false);
    resetFieldErrors();
    closeAfterCancelRef.current = false;
  };

  useEffect(() => {
    if (isOpen) resetTransientState();
  }, [isOpen]);

  const finishClose = (): void => {
    controller.supersede();
    // Keep only the local parent convenience setting. A remote can contain
    // sensitive user-info even before Rust has had a chance to redact it.
    setSource("");
    setDestinationName("");
    resetTransientState();
    onClose();
  };

  const cancelExecution = (closeAfter: boolean): void => {
    if (isCancelling) return;
    closeAfterCancelRef.current = closeAfter;
    setIsCancelling(true);
    // Invalidate the result before asking Rust to stop. Even if publication
    // wins the race, this closed/replaced attempt can no longer open it.
    controller.supersede();
    void controller.cancelCurrent().catch(() => undefined);
  };

  const requestOpenChange: React.Dispatch<React.SetStateAction<boolean>> = useCallback((value): void => {
    const open = typeof value === "function" ? value(true) : value;
    if (open) return;
    if (step === "executing") cancelExecution(true);
    else if (step !== "opening") finishClose();
  }, [controller, isCancelling, onClose, step]);

  useModalFocus(isOpen, dialogRef, requestOpenChange);

  const request: CloneRequest = { source, destinationParent, destinationName };

  const validateInput = (): boolean => validate([
    { field: "clone-source", invalid: !source.trim(), message: t.commonRequiredField },
    { field: "clone-parent", invalid: !destinationParent.trim(), message: t.commonRequiredField },
  ]);

  const planAttempt = async (): Promise<CloneAttempt | null> => {
    setStep("planning");
    setError(null);
    try {
      const planned = await controller.plan(request);
      if (!planned) return null;
      setAttempt(planned);
      setStep("preview");
      return planned;
    } catch (planError) {
      setError(planError);
      setStep("error");
      return null;
    }
  };

  const openVerified = async (cloneResult: CloneResult): Promise<void> => {
    setResult(cloneResult);
    setStep("opening");
    setError(null);
    try {
      writeLastCloneParent(attempt?.plan.destinationParent ?? destinationParent);
      await onVerifiedClone(cloneResult);
      finishClose();
    } catch (openError) {
      setError(openError);
      setStep("open-error");
    }
  };

  const executeAttempt = async (current: CloneAttempt): Promise<void> => {
    setAttempt(current);
    setStep("executing");
    setPhase("preparing");
    setError(null);
    setIsCancelling(false);
    try {
      const cloneResult = await controller.execute(current, setPhase);
      if (!cloneResult) {
        if (closeAfterCancelRef.current) finishClose();
        else {
          setStep("cancelled");
          setIsCancelling(false);
        }
        return;
      }
      setResult(cloneResult);
      if (cloneResult.outcome === "cleanup-required") {
        setStep("cleanup");
      } else {
        await openVerified(cloneResult);
      }
    } catch (cloneError) {
      if (!controller.isCurrent(current)) {
        if (closeAfterCancelRef.current) finishClose();
        else {
          setStep("cancelled");
          setIsCancelling(false);
        }
        return;
      }
      setError(cloneError);
      setStep("error");
    }
  };

  const retryClone = async (): Promise<void> => {
    const planned = await planAttempt();
    if (planned) await executeAttempt(planned);
  };

  const chooseParent = async (): Promise<void> => {
    const chosen = await controller.chooseParent(destinationParent || undefined);
    if (chosen) setDestinationParent(chosen);
  };

  const retryCleanup = async (): Promise<void> => {
    if (!attempt || !result) return;
    setIsCleaning(true);
    setError(null);
    try {
      await controller.cleanup(attempt);
      await openVerified({ ...result, outcome: "completed", cleanupPath: null });
    } catch (cleanupError) {
      setError(cleanupError);
    } finally {
      setIsCleaning(false);
    }
  };

  if (!isOpen) return null;

  const localizedError = error
    ? localizeAppError(error, t, t.cloneErrorTitle)
    : null;
  const technicalDetail = isAppError(error) ? error.detail : null;
  const credentialsCopy = attempt
    ? attempt.plan.credentialExpectation === "git-credential-helper"
      ? t.cloneCredentialsHelper
      : attempt.plan.credentialExpectation === "ssh-agent-or-key"
        ? t.cloneCredentialsSsh
        : t.cloneCredentialsNone
    : "";
  const currentPhaseIndex = PROGRESS_PHASES.indexOf(phase);

  return (
    <div className="clone-backdrop" onMouseDown={() => requestOpenChange(false)}>
      <div
        ref={dialogRef}
        className="clone-dialog auto-hide-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clone-dialog-title"
        aria-describedby="clone-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="clone-dialog__header">
          <span aria-hidden="true"><CloudDownload /></span>
          <div>
            <h2 id="clone-dialog-title">{t.cloneDialogTitle}</h2>
            <p id="clone-dialog-description">{t.cloneDialogDescription}</p>
          </div>
          {step !== "opening" && (
            <DialogCloseButton label={t.commonClose} onClick={() => requestOpenChange(false)} />
          )}
        </header>

        {(step === "input" || step === "planning") && (
          <form
            className="clone-dialog__form"
            {...formProps}
            onSubmit={(event) => {
              event.preventDefault();
              if (!validateInput()) return;
              void planAttempt();
            }}
          >
            <label className="text-field clone-dialog__field">
              <span id="clone-source-label">{t.cloneSourceLabel}</span>
              <input
                {...fieldProps("clone-source", "clone-source-help")}
                aria-labelledby="clone-source-label"
                data-autofocus
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder={t.cloneSourcePlaceholder}
                autoComplete="off"
                spellCheck={false}
                required
              />
              <small id="clone-source-help">{t.cloneSourceHelp}</small>
              <FieldError field="clone-source" errors={errors} />
            </label>
            <label className="text-field clone-dialog__field">
              <span id="clone-parent-label">{t.cloneParentLabel}</span>
              <span className="clone-dialog__path-picker">
                <input
                  {...fieldProps("clone-parent")}
                  aria-labelledby="clone-parent-label"
                  value={destinationParent}
                  onChange={(event) => setDestinationParent(event.target.value)}
                  placeholder={t.cloneParentPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <button className="secondary-button" type="button" onClick={() => void chooseParent()}>
                  <FolderOpen aria-hidden="true" />
                  {t.cloneChooseParent}
                </button>
              </span>
              <FieldError field="clone-parent" errors={errors} />
            </label>
            <label className="text-field clone-dialog__field">
              <span id="clone-name-label">{t.cloneNameLabel}</span>
              <input
                aria-labelledby="clone-name-label"
                aria-describedby="clone-name-help"
                value={destinationName}
                onChange={(event) => setDestinationName(event.target.value)}
                placeholder={t.cloneNamePlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
              <small id="clone-name-help">{t.cloneNameHelp}</small>
            </label>
            <div className="dialog-actions clone-dialog__actions">
              <button className="primary-button" type="submit" disabled={step === "planning"}>
                {step === "planning" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                {t.cloneReviewAction}
              </button>
            </div>
          </form>
        )}

        {step === "preview" && attempt && (
          <div className="clone-dialog__body">
            <div className="clone-dialog__intro">
              <h3>{t.cloneReviewTitle}</h3>
              <p>{t.cloneReviewDescription}</p>
            </div>
            <dl className="clone-dialog__summary">
              <div><dt>{t.cloneRemoteLabel}</dt><dd>{attempt.plan.sourceDisplay}</dd></div>
              <div><dt>{t.cloneDestinationLabel}</dt><dd>{attempt.plan.destinationPath}</dd></div>
            </dl>
            <div className="clone-dialog__effects">
              <section>
                <FolderInput aria-hidden="true" />
                <div><h3>{t.cloneLocalEffectsTitle}</h3><p>{t.cloneLocalEffects}</p></div>
              </section>
              <section>
                <Network aria-hidden="true" />
                <div><h3>{t.cloneRemoteEffectsTitle}</h3><p>{attempt.plan.contactsNetwork ? t.cloneRemoteEffectsNetwork : t.cloneRemoteEffectsLocal}</p></div>
              </section>
              <section>
                <KeyRound aria-hidden="true" />
                <div><h3>{t.cloneCredentialsTitle}</h3><p>{credentialsCopy}</p></div>
              </section>
              <section>
                <ShieldCheck aria-hidden="true" />
                <div><h3>{t.cloneSafetyTitle}</h3><p>{t.cloneSafetyBody}</p></div>
              </section>
            </div>
            <div className="dialog-actions clone-dialog__actions">
              <button className="secondary-button" type="button" onClick={() => setStep("input")}>{t.cloneEditAction}</button>
              <button className="primary-button" type="button" onClick={() => void executeAttempt(attempt)}>
                <CloudDownload aria-hidden="true" />{t.cloneConfirmAction}
              </button>
            </div>
          </div>
        )}

        {step === "executing" && (
          <div className="clone-dialog__body clone-dialog__progress" aria-busy="true">
            <LoadingBar label={t.cloneProgressTitle} />
            <div className="clone-dialog__intro">
              <h3>{t.cloneProgressTitle}</h3>
              <p>{t.cloneProgressDescription}</p>
            </div>
            <ol aria-label={t.cloneProgressTitle}>
              {PROGRESS_PHASES.map((item, index) => {
                const complete = index < currentPhaseIndex;
                const current = index === currentPhaseIndex;
                return (
                  <li key={item} className={complete ? "is-complete" : current ? "is-current" : undefined} aria-current={current ? "step" : undefined}>
                    <span aria-hidden="true">{complete ? <Check /> : current ? <LoaderCircle className="icon--spinning" /> : null}</span>
                    {t.cloneProgressPhase(item)}
                  </li>
                );
              })}
            </ol>
            <p className="visually-hidden" role="status">{t.cloneProgressPhase(phase)}</p>
            <div className="dialog-actions clone-dialog__actions">
              <button className="secondary-button" type="button" disabled={isCancelling} onClick={() => cancelExecution(false)}>
                {isCancelling ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : null}
                {isCancelling ? t.cloneCancelling : t.cloneCancelAction}
              </button>
            </div>
          </div>
        )}

        {(step === "error" || step === "cancelled") && (
          <div className="clone-dialog__body clone-dialog__result" role={step === "error" ? "alert" : "status"}>
            <span className={`clone-dialog__result-icon${step === "error" ? " clone-dialog__result-icon--error" : ""}`} aria-hidden="true">
              {step === "error" ? <CircleAlert /> : <Check />}
            </span>
            <h3>{step === "error" ? t.cloneErrorTitle : t.cloneCancelled}</h3>
            {localizedError && <p>{localizedError}</p>}
            {technicalDetail && (
              <details><summary>{t.cloneTechnicalDetails}</summary><pre>{technicalDetail}</pre></details>
            )}
            <div className="dialog-actions clone-dialog__actions">
              <button className="secondary-button" type="button" onClick={finishClose}>{t.commonClose}</button>
              <button className="primary-button" type="button" onClick={() => void retryClone()}>{t.cloneRetryAction}</button>
            </div>
          </div>
        )}

        {step === "cleanup" && result && (
          <div className="clone-dialog__body clone-dialog__result" role="alert">
            <span className="clone-dialog__result-icon clone-dialog__result-icon--warning" aria-hidden="true"><ShieldCheck /></span>
            <h3>{t.cloneCleanupTitle}</h3>
            <p>{t.cloneCleanupDescription}</p>
            <code>{result.cleanupPath}</code>
            {localizedError && <p>{localizedError}</p>}
            <div className="dialog-actions clone-dialog__actions">
              <button className="primary-button" type="button" disabled={isCleaning} onClick={() => void retryCleanup()}>
                {isCleaning && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
                {isCleaning ? t.cloneCleaningUp : t.cloneCleanupAction}
              </button>
            </div>
          </div>
        )}

        {(step === "opening" || step === "open-error") && result && (
          <div className="clone-dialog__body clone-dialog__result" aria-busy={step === "opening"} role={step === "open-error" ? "alert" : "status"}>
            <span className={`clone-dialog__result-icon${step === "open-error" ? " clone-dialog__result-icon--error" : ""}`} aria-hidden="true">
              {step === "opening" ? <LoaderCircle className="icon--spinning" /> : <CircleAlert />}
            </span>
            <h3>{step === "opening" ? t.cloneOpeningTitle : t.cloneOpenFailedTitle}</h3>
            <p>{step === "opening" ? t.cloneOpeningDescription : t.cloneOpenFailedDescription}</p>
            <code>{result.destinationPath}</code>
            <p>{t.cloneDependencyNotice(result.submodules, result.gitLfs)}</p>
            {localizedError && <p>{localizedError}</p>}
            {step === "open-error" && (
              <div className="dialog-actions clone-dialog__actions">
                <button className="secondary-button" type="button" onClick={finishClose}>{t.commonClose}</button>
                <button className="primary-button" type="button" onClick={() => void openVerified(result)}>{t.cloneRetryOpen}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
