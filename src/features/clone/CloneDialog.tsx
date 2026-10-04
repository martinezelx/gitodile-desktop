import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CloudDownload,
  FolderOpen,
  Info,
  Laptop,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { AccountPicker, accountsPort, providerForSource, useAccounts, type AccountsPort } from "../accounts";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogFacts, FieldError, useFieldErrors, useModalFocus } from "../../shared/ui";
import type { CloneAttempt, CloneController } from "./controller";
import {
  readLastCloneParent,
  writeLastCloneParent,
  type CloneProgressPhase,
  type CloneRequest,
  type CloneResult,
} from "./domain";

/* Six phases on the wire, three steps on screen: the temporary folder, the
   address clean-up and the move into place are how a clone stays safe, not
   something the reader has to follow (DESIGN.md § Content design). */
const PROGRESS_STEPS: { step: "downloading" | "checking" | "opening"; phases: CloneProgressPhase[] }[] = [
  { step: "downloading", phases: ["preparing", "cloning"] },
  { step: "checking", phases: ["sanitizingRemote", "verifying"] },
  { step: "opening", phases: ["publishing", "finalizing"] },
];

type DialogStep =
  | "input"
  | "planning"
  | "preview"
  | "executing"
  | "cancelled"
  | "error"
  | "cleanup"
  | "account-warning"
  | "opening"
  | "open-error";

export function CloneDialog({
  isOpen,
  controller,
  onClose,
  onVerifiedClone,
  accountPort = accountsPort,
}: {
  isOpen: boolean;
  controller: CloneController;
  onClose: () => void;
  onVerifiedClone: (result: CloneResult) => Promise<void>;
  accountPort?: AccountsPort;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeAfterCancelRef = useRef(false);
  const [source, setSource] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const { catalog, failed: accountsFailed, pending: checkingAccounts, check: checkAccounts } = useAccounts(accountPort, isOpen);
  const provider = providerForSource(source, catalog.providers);
  useEffect(() => { setAccountId(null); }, [provider]);
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
    t.cloneDialogTitle,
    isOpen &&
      (source.trim() !== "" ||
        accountId !== null ||
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

  const request: CloneRequest = { source, destinationParent, destinationName, ...(accountId ? { accountId } : {}) };

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
      } else if (cloneResult.accountSelectionSaved === false) {
        setStep("account-warning");
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
      const completed = { ...result, outcome: "completed" as const, cleanupPath: null };
      setResult(completed);
      if (completed.accountSelectionSaved === false) setStep("account-warning");
      else await openVerified(completed);
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
      ? attempt.plan.accountId ? t.accountsCloneCredentials : t.cloneCredentialsHelper
      : attempt.plan.credentialExpectation === "ssh-agent-or-key"
        ? t.cloneCredentialsSsh
        : t.cloneCredentialsNone
    : "";
  const currentStepIndex = PROGRESS_STEPS.findIndex((item) => item.phases.includes(phase));
  const close = (): void => requestOpenChange(false);

  // A result is a short message: the small shell, a status glyph and the way
  // out. The flow itself — form, review, progress — keeps the large one.
  if (step === "error" || step === "cancelled" || step === "cleanup" || step === "open-error" || step === "account-warning") {
    const isError = step === "error" || step === "open-error";
    const title = step === "account-warning" ? t.cloneAccountNotSavedTitle : step === "error" ? t.cloneErrorTitle
      : step === "cancelled" ? t.cloneCancelled
        : step === "cleanup" ? t.cloneCleanupTitle
          : t.cloneOpenFailedTitle;
    return (
      <Dialog
        size="s"
        role={isError ? "alertdialog" : "dialog"}
        title={title}
        titleId="clone-dialog-title"
        icon={isError ? <CircleAlert /> : step === "cleanup" ? <ShieldCheck /> : <Info />}
        tone={isError ? "danger" : step === "cleanup" || step === "account-warning" ? "warning" : "neutral"}
        onClose={step === "cleanup" ? undefined : close}
        closeLabel={t.commonClose}
        dialogRef={dialogRef}
      >
        {step === "cancelled" && <p className="app-dialog__text">{t.cloneCancelledDescription}</p>}
        {step === "cleanup" && <p className="app-dialog__text">{t.cloneCleanupDescription}</p>}
        {step === "open-error" && <p className="app-dialog__text">{t.cloneOpenFailedDescription}</p>}
        {step === "account-warning" && <>
          <p className="app-dialog__text">{t.cloneAccountNotSavedDescription}</p>
          <dl className="app-dialog__kv"><dt>{t.cloneDestinationLabel}</dt><dd><code>{result?.destinationPath}</code></dd></dl>
        </>}
        {localizedError && <p className="app-dialog__text">{localizedError}</p>}
        {step === "open-error" && result && (
          <p className="app-dialog__text">{t.cloneDependencyNotice(result.submodules, result.gitLfs)}</p>
        )}
        {(technicalDetail || (step === "cleanup" && result?.cleanupPath)) && (
          <details className="app-dialog__details">
            <summary>{t.cloneTechnicalDetails}</summary>
            <pre>{step === "cleanup" ? result?.cleanupPath : technicalDetail}</pre>
          </details>
        )}
        <div className="dialog-actions">
          {step === "cleanup" ? (
            <button className="primary-button" type="button" disabled={isCleaning} onClick={() => void retryCleanup()}>
              {isCleaning && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
              {isCleaning ? t.cloneCleaningUp : t.cloneCleanupAction}
            </button>
          ) : (
            <>
              <button className="secondary-button" type="button" onClick={finishClose}>{t.commonClose}</button>
              {step === "account-warning" ? null : step === "open-error" && result ? (
                <button className="primary-button" type="button" onClick={() => void openVerified(result)}>{t.cloneRetryOpen}</button>
              ) : (
                <button className="primary-button" type="button" onClick={() => void retryClone()}>{t.cloneRetryAction}</button>
              )}
            </>
          )}
        </div>
      </Dialog>
    );
  }

  const isForm = step === "input" || step === "planning";
  const title = step === "preview" ? t.cloneReviewTitle
    : step === "executing" && attempt ? t.cloneProgressTitleNamed(attempt.plan.destinationName)
      : step === "opening" ? t.cloneOpeningTitle
        : t.cloneDialogTitle;
  // The subtitle belongs to the step it describes: the form says what cloning
  // is, the review that nothing has happened yet, and progress says nothing.
  const subtitle = isForm ? t.cloneDialogDescription : step === "preview" ? t.cloneReviewDescription : undefined;

  return (
    <Dialog
      size="l"
      title={title}
      titleId="clone-dialog-title"
      subtitle={subtitle}
      icon={<CloudDownload />}
      onClose={step === "opening" ? undefined : close}
      closeLabel={t.commonClose}
      dialogRef={dialogRef}
      className="clone-dialog auto-hide-scrollbar"
    >
      {isForm && (
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
          {provider && <AccountPicker catalog={catalog} provider={provider} value={accountId}
            onChange={setAccountId} onCheck={() => void checkAccounts(provider)} disabled={checkingAccounts} failed={accountsFailed} />}
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
              value={destinationName}
              onChange={(event) => setDestinationName(event.target.value)}
              placeholder={t.cloneNamePlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={close}>{t.commonCancel}</button>
            <button className="primary-button" type="submit" disabled={step === "planning"}>
              {step === "planning" && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
              {t.cloneReviewAction}
            </button>
          </div>
        </form>
      )}

      {step === "preview" && attempt && (
        <>
          <dl className="app-dialog__kv">
            <dt>{t.cloneRemoteLabel}</dt><dd><code>{attempt.plan.sourceDisplay}</code></dd>
            <dt>{t.cloneDestinationLabel}</dt><dd><code>{attempt.plan.destinationPath}</code></dd>
            {attempt.plan.accountId && <><dt>{t.accountsProjectLabel}</dt><dd>@{attempt.plan.accountId.split(":")[1]}</dd></>}
          </dl>
          <DialogFacts
            facts={[
              { icon: <Laptop />, text: t.cloneLocalEffects },
              {
                icon: <ShieldCheck />,
                text: attempt.plan.contactsNetwork ? t.cloneRemoteEffectsNetwork : t.cloneRemoteEffectsLocal,
                safe: true,
              },
            ]}
          />
          {/* Sign-in and what cancelling does are true and worth finding, but
              not what decides whether to clone. */}
          <details className="app-dialog__details">
            <summary>{t.cloneTechnicalDetails}</summary>
            <pre>{`${credentialsCopy}\n${t.cloneSafetyBody}`}</pre>
          </details>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setStep("input")}>{t.cloneEditAction}</button>
            <button className="primary-button" type="button" onClick={() => void executeAttempt(attempt)}>
              <CloudDownload aria-hidden="true" />{t.cloneConfirmAction}
            </button>
          </div>
        </>
      )}

      {step === "executing" && (
        <>
          <ol className="app-dialog__steps" aria-label={t.cloneProgressTitle} aria-busy="true">
            {PROGRESS_STEPS.map((item, index) => {
              const complete = index < currentStepIndex;
              const current = index === currentStepIndex;
              return (
                <li
                  key={item.step}
                  className={`app-dialog__step${current ? " app-dialog__step--active" : complete ? " app-dialog__step--done" : ""}`}
                  aria-current={current ? "step" : undefined}
                >
                  <span className="app-dialog__step-dot" aria-hidden="true">{complete && <Check />}</span>
                  {t.cloneStep(item.step)}
                </li>
              );
            })}
          </ol>
          <p className="visually-hidden" role="status">{t.cloneProgressPhase(phase)}</p>
          <div className="app-dialog__foot">
            <p className="app-dialog__note"><Info aria-hidden="true" />{t.cloneProgressDescription}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" disabled={isCancelling} onClick={() => cancelExecution(false)}>
                {isCancelling ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : null}
                {isCancelling ? t.cloneCancelling : t.cloneCancelAction}
              </button>
            </div>
          </div>
        </>
      )}

      {step === "opening" && result && (
        <p className="app-dialog__note" role="status" aria-busy="true">
          <LoaderCircle className="icon--spinning" aria-hidden="true" />
          {t.cloneOpeningDescription}
        </p>
      )}
    </Dialog>
  );
}
