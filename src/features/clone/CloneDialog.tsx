import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  CircleAlert,
  CloudDownload,
  FolderOpen,
  Info,
  Laptop,
  LoaderCircle,
  ShieldCheck,
  Link,
  ArrowRight,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { AccountPicker, accountsPort, providerForSource, providerKind, useAccounts, type AccountsPort, type HostingKind } from "../accounts";
import { RepositoryBrowser, createRepositoryBrowserController, repositoryBrowserPort, type RepositoryBrowserPort, type RepositoryChoice } from "../repository-browser";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogFacts, FieldError, HostingProviderIcon, useFieldErrors, useModalFocus } from "../../shared/ui";
import { cloneSourceSummary, cloneSuggestedName } from "./sourceAccess";
import type { CloneAttempt, CloneController } from "./controller";
import {
  readLastCloneConnection,
  readLastCloneParent,
  writeLastCloneConnection,
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
  | "destination"
  | "executing"
  | "cancelled"
  | "error"
  | "cleanup"
  | "account-warning"
  | "opening"
  | "open-error";

export function CloneDialog({
  isOpen,
  initialSource = "",
  controller,
  onClose,
  onVerifiedClone,
  accountPort = accountsPort,
  repositoryPort = repositoryBrowserPort,
}: {
  isOpen: boolean;
  /** An address the caller already has, such as one pasted into Home's
   * launcher; it fills the field when the dialog opens and is still checked
   * like anything typed there. */
  initialSource?: string;
  controller: CloneController;
  onClose: () => void;
  onVerifiedClone: (result: CloneResult) => Promise<void>;
  accountPort?: AccountsPort;
  repositoryPort?: RepositoryBrowserPort;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeAfterCancelRef = useRef(false);
  const [source, setSource] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"url" | HostingKind>("url");
  const [selectedRepository, setSelectedRepository] = useState<RepositoryChoice | null>(null);
  const [repositoryBrowser] = useState(() => createRepositoryBrowserController(repositoryPort));
  const browserState = useSyncExternalStore(repositoryBrowser.subscribe, repositoryBrowser.snapshot);
  const access = useSyncExternalStore(controller.sourceAccess.subscribe, controller.sourceAccess.snapshot);
  const { catalog, failed: accountsFailed, pending: checkingAccounts, check: checkAccounts } = useAccounts(accountPort, isOpen);
  const provider = providerForSource(source, catalog.providers);
  useEffect(() => { setAccountId(current => provider && current?.startsWith(`${provider}:`) ? current : null); }, [provider]);
  // Entering a discovery tab offers the connection used last time, or the only
  // usable one. Selecting is local; finding projects stays an explicit action.
  // A check in progress (such as the launch sync, ADR 0027) may still make
  // connections usable, so wait for it.
  const preselected = useRef<string | null>(null);
  useEffect(() => {
    if (sourceMode === "url") { preselected.current = null; return; }
    if (preselected.current === sourceMode || catalog.providers.length === 0 || browserState.accountId) return;
    if (checkingAccounts || catalog.busy) return;
    preselected.current = sourceMode;
    const usable = catalog.accounts.filter(account => account.available
      && providerKind(catalog.providers, account.provider) === sourceMode);
    const remembered = readLastCloneConnection(sourceMode);
    const choice = usable.find(account => account.id === remembered) ?? (usable.length === 1 ? usable[0] : undefined);
    if (choice) repositoryBrowser.select(choice.id);
  }, [sourceMode, catalog, browserState.accountId, repositoryBrowser, checkingAccounts]);
  const [destinationParent, setDestinationParent] = useState(readLastCloneParent);
  const initialDestinationParent = useRef(destinationParent);
  const [destinationName, setDestinationName] = useState("");
  const [step, setStep] = useState<DialogStep>("input");
  const [isPlanning, setIsPlanning] = useState(false);
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
    setIsPlanning(false);
    resetFieldErrors();
    closeAfterCancelRef.current = false;
  };

  useEffect(() => {
    if (isOpen) {
      resetTransientState();
      if (initialSource) { setSourceMode("url"); setSource(initialSource); }
    }
    else { controller.sourceAccess.reset(); repositoryBrowser.cancel(); }
  }, [isOpen]);
  useEffect(() => () => { controller.sourceAccess.reset(); repositoryBrowser.cancel(); controller.supersede(); }, [controller, repositoryBrowser]);

  // Planning stays local; an edit invalidates the preceding destination plan.
  // Its preview is rendered beside the fields, never on a third screen.
  useEffect(() => {
    if (!isOpen || step !== "destination") return;
    let current = true;
    controller.supersede();
    setAttempt(null); setError(null);
    setIsPlanning(Boolean(destinationParent.trim()));
    if (!destinationParent.trim()) return;
    const timer = setTimeout(() => {
      void controller.plan({ source, destinationParent, destinationName, ...(accountId ? { accountId } : {}) }).then(planned => {
        if (current && planned) setAttempt(planned);
      }, failure => { if (current) setError(failure); }).finally(() => { if (current) setIsPlanning(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [isOpen, step, source, destinationParent, destinationName, accountId, controller]);

  useEffect(() => {
    if (step === "destination") dialogRef.current?.querySelector<HTMLInputElement>("#clone-parent")?.focus();
    if (step === "input" && sourceMode === "url") dialogRef.current?.querySelector<HTMLInputElement>("#clone-source")?.focus();
  }, [step, sourceMode]);

  const finishClose = (): void => {
    controller.supersede();
    // Keep only the local parent convenience setting. A remote can contain
    // sensitive user-info even before Rust has had a chance to redact it.
    setSource("");
    setAccountId(null);
    setSourceMode("url");
    setSelectedRepository(null);
    controller.sourceAccess.reset();
    repositoryBrowser.cancel();
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
    setError(null);
    try {
      const planned = await controller.plan(request);
      if (!planned) return null;
      setAttempt(planned);
      return planned;
    } catch (planError) {
      setError(planError);
      setStep("error");
      return null;
    }
  };

  const chooseDestination = (): void => {
    if (!validate([{ field: "clone-source", invalid: !source.trim(), message: t.commonRequiredField }])) return;
    controller.sourceAccess.cancel();
    repositoryBrowser.cancel();
    if (!destinationName.trim()) setDestinationName(cloneSuggestedName(source));
    setStep("destination");
  };

  const editSource = (value: string): void => {
    const nextProvider = providerForSource(value, catalog.providers);
    const nextAccount = nextProvider && accountId?.startsWith(nextProvider + ":") ? accountId : null;
    setSource(value); setAccountId(nextAccount); setDestinationName(""); setSelectedRepository(null);
    controller.sourceAccess.update(value, nextAccount, catalog.providers);
  };

  const changeSourceMode = (mode: "url" | HostingKind): void => {
    controller.sourceAccess.cancel(); repositoryBrowser.cancel();
    if (mode !== sourceMode) { repositoryBrowser.select(null); setSelectedRepository(null); setSource(""); setAccountId(null); setDestinationName(""); }
    setSourceMode(mode); resetFieldErrors();
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

  const isForm = step === "input";
  const title = step === "destination" ? t.cloneReviewTitle
    : step === "executing" && attempt ? t.cloneProgressTitleNamed(attempt.plan.destinationName)
      : step === "opening" ? t.cloneOpeningTitle
        : t.cloneDialogTitle;
  // The subtitle belongs to the step it describes: the form says what cloning
  // is, the review that nothing has happened yet, and progress says nothing.
  const subtitle = isForm ? t.cloneDialogDescription : step === "destination" ? t.cloneReviewDescription : undefined;
  const browserChoiceValid = selectedRepository && selectedRepository.accountId === browserState.accountId &&
    catalog.accounts.some(account => account.id === selectedRepository.accountId && account.available);
  const accessCurrent = access.source === source && access.accountId === accountId;
  const accessStatus = accessCurrent ? access.status : "idle";
  const accessTitle = accessStatus === "checking" ? t.cloneAccessChecking : accessStatus === "accessible"
    ? t.cloneAccessConfirmed : accessStatus === "unavailable" ? t.cloneAccessUnavailable : t.cloneAccessUnconfirmed;
  const selectedAccount = catalog.accounts.find(account => account.id === accountId);
  const connectionLabel = selectedAccount
    ? "@" + selectedAccount.login + " · " + (accountId?.includes(":token.") ? t.accountsTokenMethod : t.accountsBrowserMethod)
    : t.accountsUseGit;
  const reviewedRequestMatches = attempt?.request.source === source && attempt.request.destinationParent === destinationParent &&
    attempt.request.destinationName === destinationName && (attempt.request.accountId ?? null) === accountId;

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
      className={`clone-dialog auto-hide-scrollbar${isForm && sourceMode !== "url" ? " clone-dialog--repositories" : ""}`}
    >
      {isForm && (
        <form className="clone-dialog__form" {...formProps} onSubmit={event => { event.preventDefault(); if (sourceMode === "url" || browserChoiceValid) chooseDestination(); }}>
          <nav className="clone-dialog__sources" aria-label={t.cloneSourceTabs}>
            <button type="button" aria-pressed={sourceMode === "url"} onClick={() => changeSourceMode("url")}><Link aria-hidden="true" />{t.cloneGitAddress}</button>
            <button type="button" aria-pressed={sourceMode === "github"} onClick={() => changeSourceMode("github")}><HostingProviderIcon provider="github" />GitHub</button>
            <button type="button" aria-pressed={sourceMode === "gitlab"} onClick={() => changeSourceMode("gitlab")}><HostingProviderIcon provider="gitlab" />GitLab</button>
            <button type="button" aria-pressed={sourceMode === "bitbucket"} onClick={() => changeSourceMode("bitbucket")}><HostingProviderIcon provider="bitbucket" />Bitbucket</button>
          </nav>
          {sourceMode !== "url" ? <RepositoryBrowser provider={sourceMode} controller={repositoryBrowser} catalog={catalog} checking={checkingAccounts} failed={accountsFailed}
            onConnectionChange={id => writeLastCloneConnection(sourceMode, id)}
            onCheck={() => void checkAccounts(sourceMode)} selected={selectedRepository} onClearSelection={() => setSelectedRepository(null)}
            onChoose={choice => { setSelectedRepository(choice); setSource(choice.repository.cloneUrl); setAccountId(choice.accountId); setDestinationName(choice.repository.name); }} /> : <>
            <label className="text-field clone-dialog__field">
              <span id="clone-source-label">{t.cloneSourceLabel}</span>
              <span className="clone-dialog__address-input">
                <input {...fieldProps("clone-source", "clone-source-help")} id="clone-source" aria-labelledby="clone-source-label" data-autofocus
                  value={source} onChange={event => editSource(event.target.value)} placeholder={t.cloneSourcePlaceholder} autoComplete="off" spellCheck={false} required />
                {accessStatus === "checking" && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
                {accessStatus === "accessible" && <Check className="clone-dialog__access-ok" aria-hidden="true" />}
                {accessStatus === "unavailable" && <CircleAlert className="clone-dialog__access-warning" aria-hidden="true" />}
              </span>
              <small id="clone-source-help">{t.cloneSourceHelp}</small>
              <FieldError field="clone-source" errors={errors} />
            </label>
            {provider && <AccountPicker catalog={catalog} provider={provider} value={accountId} label={t.cloneConnectionLabel}
              onChange={id => { setAccountId(id); controller.sourceAccess.update(source, id, catalog.providers); }}
              onCheck={() => void checkAccounts(provider)} disabled={checkingAccounts} failed={accountsFailed} />}
            {accessStatus !== "idle" && <div className={"clone-dialog__access clone-dialog__access--" + accessStatus} role="status" aria-live="polite">
              {accessStatus === "accessible" ? <Check aria-hidden="true" /> : <HostingProviderIcon provider={provider ? providerKind(catalog.providers, provider) : "github"} />}
              <div><strong>{accessTitle}</strong><small>{accessStatus === "unavailable" ? t.cloneAccessUnavailableHelp : accessStatus === "unconfirmed" ? t.cloneAccessUnconfirmedHelp : t.cloneAccessConnection(connectionLabel)}</small></div>
              <button type="button" className="clone-dialog__text-action" onClick={() => accessStatus === "checking" ? controller.sourceAccess.cancel() : controller.sourceAccess.update(source, accountId, catalog.providers)}>
                {accessStatus === "checking" ? t.commonCancel : t.cloneAccessRetry}
              </button>
            </div>}
          </>}
          <footer className="clone-dialog__footer">
            <p className="app-dialog__note">{sourceMode !== "url" && browserChoiceValid ? <><strong>{selectedRepository?.repository.fullName}</strong><span>{t.cloneNextDestination}</span></> : t.cloneNextDestination}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={close}>{t.commonCancel}</button>
              <button className="primary-button" type="submit" disabled={sourceMode !== "url" ? !browserChoiceValid : accessStatus === "unavailable"}>
                {accessStatus === "checking" || accessStatus === "unconfirmed" ? t.cloneContinueUnchecked : t.cloneReviewAction}<ArrowRight aria-hidden="true" />
              </button>
            </div>
          </footer>
        </form>
      )}

      {step === "destination" && (
        <form className="clone-dialog__form" {...formProps} onSubmit={event => { event.preventDefault(); if (validateInput() && attempt && reviewedRequestMatches && !isPlanning) void executeAttempt(attempt); }}>
          <div className="clone-dialog__picked">
            {sourceMode !== "url" ? <HostingProviderIcon provider={sourceMode} /> : <Link aria-hidden="true" />}
            <div><strong>{sourceMode !== "url" ? selectedRepository?.repository.fullName : t.cloneGitAddress}</strong>
              <small>{attempt?.plan.sourceDisplay ?? cloneSourceSummary(source)}</small>
              <small>{connectionLabel}</small></div>
            <button className="clone-dialog__text-action" type="button" onClick={() => { controller.supersede(); setStep("input"); }}>{t.cloneChangeSource}</button>
          </div>
          <label className="text-field clone-dialog__field">
            <span id="clone-parent-label">{t.cloneParentLabel}</span>
            <span className="clone-dialog__path-picker">
              <input {...fieldProps("clone-parent")} id="clone-parent" aria-labelledby="clone-parent-label" value={destinationParent}
                onChange={event => setDestinationParent(event.target.value)} placeholder={t.cloneParentPlaceholder} autoComplete="off" spellCheck={false} required />
              <button className="secondary-button" type="button" onClick={() => void chooseParent()}><FolderOpen aria-hidden="true" />{t.cloneChooseParent}</button>
            </span>
            <FieldError field="clone-parent" errors={errors} />
          </label>
          <label className="text-field clone-dialog__field">
            <span id="clone-name-label">{t.cloneNameLabel}</span>
            <input id="clone-name" aria-labelledby="clone-name-label" value={destinationName} onChange={event => setDestinationName(event.target.value)} placeholder={t.cloneNamePlaceholder} autoComplete="off" spellCheck={false} />
            <small>{t.cloneNameHelp}</small>
          </label>
          {isPlanning && <p className="app-dialog__note" role="status"><LoaderCircle className="icon--spinning" aria-hidden="true" />{t.cloneCheckingDestination}</p>}
          {attempt && reviewedRequestMatches && <p className="app-dialog__note clone-dialog__destination"><FolderOpen aria-hidden="true" /><span>{t.cloneDestinationLabel}: <code>{attempt.plan.destinationPath}</code></span></p>}
          {localizedError && <p className="app-dialog__text" role="alert">{localizedError}</p>}
          <DialogFacts facts={[
            { icon: <Laptop />, text: t.cloneLocalEffects },
            { icon: <ShieldCheck />, text: attempt?.plan.contactsNetwork === false ? t.cloneRemoteEffectsLocal : t.cloneRemoteEffectsNetwork, safe: true },
          ]} />
          <footer className="clone-dialog__footer">
            <p className="app-dialog__note">{t.cloneNothingUntilConfirm}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={close}>{t.commonCancel}</button>
              <button className="primary-button" type="submit" disabled={!attempt || !reviewedRequestMatches || isPlanning}><CloudDownload aria-hidden="true" />{t.cloneConfirmAction}</button>
            </div>
          </footer>
        </form>
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
